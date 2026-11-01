import { prismaQuery } from "@casl/prisma";
import { INestApplication } from "@nestjs/common";
import { PrismaClient, Report, ReportReason, ReportStatus } from "generated/prisma/client";
import { Server } from "http";
import { DeepMockProxy, mockReset } from "jest-mock-extended";
import { S3Service } from "src/sdk/aws/s3/s3.service";
import { API_GLOBAL_PREFIX } from "src/swagger/swagger.config";
import request from "supertest";
import { TEST_OTHER_ACCESS_TOKEN, TEST_OTHER_USER_ID, TEST_TARGET_USER_ID, authHeader } from "./helpers/auth.fixtures";
import { createTestApp } from "./helpers/create-test-app";
import { TEST_EVENT_ID, buildEvent, buildOrganizerAccess } from "./helpers/events.fixtures";
import { expectApiError } from "./helpers/expect-api-error";
import { TEST_REPORT_ID, buildMemberReport, buildReport } from "./helpers/moderation.fixtures";
import { buildPhoto } from "./helpers/photos.fixtures";
import { TEST_NOW, TEST_USER_ID, buildUserWithDetails } from "./helpers/users.fixtures";

/**
 * What each role sees of a report (docs/moderation.md §2, §3, §8): an organizer
 * never sees a report about themselves or their own photo, and the platform's
 * queue pages leave the authority reference to the single report.
 *
 * The test user (TEST_USER_ID) and TEST_OTHER_USER_ID both organize the event.
 * The list queries run against an in-memory table, filtered with the same
 * Prisma `where` the service sends, so "not listed" means the query leaves the
 * row out, not that the mock was told to.
 */
describe("Report visibility (integration)", () => {
  let app: INestApplication;
  let prisma: DeepMockProxy<PrismaClient>;
  let httpServer: Server;
  const s3Service = { deleteObject: jest.fn(), deleteObjects: jest.fn() };

  const eventReportsPath = `/${API_GLOBAL_PREFIX}/events/${TEST_EVENT_ID}/reports`;
  const reportPath = (reportId: string) => `/${API_GLOBAL_PREFIX}/reports/${reportId}`;
  const adminPath = (path: string) => `/${API_GLOBAL_PREFIX}/admin/${path}`;

  const hostAccess = buildOrganizerAccess();
  const coHostAccess = buildOrganizerAccess({ id: "12121212-1212-4212-8212-121212121212", userId: TEST_OTHER_USER_ID });
  const bothOrganizers = [hostAccess, coHostAccess];

  const MEMBER_ABOUT_HOST_ID = "dddddddd-aaaa-4222-8333-dddddddddddd";
  const PHOTO_ABOUT_HOST_ID = "dddddddd-bbbb-4222-8333-dddddddddddd";
  const ABOUT_SOMEONE_ELSE_ID = "dddddddd-cccc-4222-8333-dddddddddddd";

  /** Reports filed by the target user. The first two are about the host (TEST_USER_ID). */
  const table = (queue: "ORGANIZERS" | "PLATFORM"): Report[] => [
    buildMemberReport({
      id: MEMBER_ABOUT_HOST_ID,
      reporterId: TEST_TARGET_USER_ID,
      reportedUserId: TEST_USER_ID,
      reason: ReportReason.HARASSMENT,
      note: "He cornered me at the bar after the speeches",
      queue,
    }),
    buildReport({
      id: PHOTO_ABOUT_HOST_ID,
      reporterId: TEST_TARGET_USER_ID,
      reportedUserId: TEST_USER_ID,
      queue,
    }),
    buildReport({
      id: ABOUT_SOMEONE_ELSE_ID,
      reporterId: TEST_USER_ID,
      reportedUserId: "77777777-7777-4777-8777-777777777777",
    }),
  ];

  /** Serves report.findMany from `rows`, applying the query's `where` as Postgres would. */
  const serveReports = (rows: Report[]) => {
    const withEvent = rows.map((row) => ({ ...row, event: { ...buildEvent(), eventAccesses: bothOrganizers } }));
    prisma.report.findMany.mockImplementation(((args: { where: object }) => {
      const matches = prismaQuery(args.where as never);
      return Promise.resolve(withEvent.filter((row) => matches(row)));
    }) as never);
  };

  /** The event as the list loads it: with the caller's own access only. */
  const eventFor = (callerAccess: typeof hostAccess) => ({
    ...buildEvent(),
    eventAccesses: [callerAccess],
    _count: { eventAccesses: 5 },
  });

  const listIds = async (token?: string): Promise<string[]> => {
    const response = await request(httpServer).get(eventReportsPath).set(authHeader(token)).expect(200);
    return (response.body as { data: { items: { id: string }[] } }).data.items.map((item) => item.id);
  };

  beforeAll(async () => {
    const context = await createTestApp((builder) => builder.overrideProvider(S3Service).useValue(s3Service));
    app = context.app;
    prisma = context.prisma;
    httpServer = app.getHttpServer() as Server;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    mockReset(prisma);
    prisma.user.findUnique.mockResolvedValue(buildUserWithDetails());
    prisma.$transaction.mockImplementation(async (fn) => (fn as (tx: unknown) => Promise<unknown>)(prisma));
    s3Service.deleteObject.mockReset().mockResolvedValue(undefined);
    s3Service.deleteObjects.mockReset().mockResolvedValue({ deleted: [], failed: [] });
  });

  describe("an organizer's list", () => {
    it("leaves out the member report and the photo report about the calling organizer", async () => {
      prisma.event.findUnique.mockResolvedValue(eventFor(hostAccess));
      serveReports(table("PLATFORM"));

      expect(await listIds()).toEqual([ABOUT_SOMEONE_ELSE_ID]);
    });

    it("still shows both to another organizer of the event", async () => {
      prisma.event.findUnique.mockResolvedValue(eventFor(coHostAccess));
      serveReports(table("PLATFORM"));

      expect(await listIds(TEST_OTHER_ACCESS_TOKEN)).toEqual([
        MEMBER_ABOUT_HOST_ID,
        PHOTO_ABOUT_HOST_ID,
        ABOUT_SOMEONE_ELSE_ID,
      ]);
    });

    it("keeps a report whose subject deleted their account", async () => {
      prisma.event.findUnique.mockResolvedValue(eventFor(hostAccess));
      serveReports([buildMemberReport({ reporterId: TEST_TARGET_USER_ID, reportedUserId: null })]);

      expect(await listIds()).toEqual([TEST_REPORT_ID]);
    });
  });

  describe("resolving", () => {
    /**
     * Filed while the host was a participant, so still in the organizers' queue:
     * the one case where another organizer may close a report about an organizer.
     */
    const promotedCases = [
      ["member report", MEMBER_ABOUT_HOST_ID],
      ["photo report", PHOTO_ABOUT_HOST_ID],
    ] as const;

    const loadAs = (reportId: string, callerAccess: typeof hostAccess, queue: "ORGANIZERS" | "PLATFORM") => {
      const report = table(queue).find((row) => row.id === reportId)!;
      prisma.report.findUnique.mockResolvedValue({
        ...report,
        event: { ...buildEvent(), eventAccesses: [callerAccess], _count: { eventAccesses: 5 } },
      } as never);
      prisma.photo.findUnique.mockResolvedValue(buildPhoto({ addedById: TEST_USER_ID }));
      prisma.report.updateManyAndReturn.mockResolvedValue([
        { ...report, status: ReportStatus.DISMISSED, resolvedById: callerAccess.userId, resolvedAt: TEST_NOW },
      ]);
      prisma.report.updateMany.mockResolvedValue({ count: 0 });
      // No other open report on the same target.
      prisma.report.findMany.mockResolvedValue([]);
      prisma.report.count.mockResolvedValue(0);
      prisma.photo.count.mockResolvedValue(1);
    };

    it.each(promotedCases)("refuses the %s to the organizer it is about", async (_label, reportId) => {
      loadAs(reportId, hostAccess, "ORGANIZERS");

      const response = await request(httpServer)
        .patch(reportPath(reportId))
        .set(authHeader())
        .send({ action: "DISMISS" })
        .expect(403);

      expectApiError(response.body, "ORGANIZER_ONLY", { action: "update", subject: "Report" });
      expect(prisma.report.updateManyAndReturn).not.toHaveBeenCalled();
    });

    it.each(promotedCases)("lets another organizer close the %s", async (_label, reportId) => {
      loadAs(reportId, coHostAccess, "ORGANIZERS");

      const response = await request(httpServer)
        .patch(reportPath(reportId))
        .set(authHeader(TEST_OTHER_ACCESS_TOKEN))
        .send({ action: "DISMISS" })
        .expect(200);

      expect((response.body as { data: { status: string } }).data.status).toBe("DISMISSED");
      expect(prisma.report.updateManyAndReturn).toHaveBeenCalled();
    });

    it.each(promotedCases)(
      "leaves the %s to the platform once it is there, for the other organizer too",
      async (_label, reportId) => {
        loadAs(reportId, coHostAccess, "PLATFORM");

        const response = await request(httpServer)
          .patch(reportPath(reportId))
          .set(authHeader(TEST_OTHER_ACCESS_TOKEN))
          .send({ action: "DISMISS" })
          .expect(403);

        expectApiError(response.body, "REPORT_ESCALATED", { reportId });
      },
    );
  });

  describe("the platform", () => {
    const withEvidence = (report: Report) => ({ ...report, evidence: null });
    const referenced = () =>
      withEvidence(
        buildReport({
          queue: "PLATFORM",
          reason: ReportReason.CHILD_SAFETY,
          authorityReference: "CT-2026-0001",
          holdUntil: TEST_NOW,
          holdReason: "CHILD_SAFETY",
        }),
      );

    beforeEach(() => {
      prisma.user.findUnique.mockResolvedValue({ ...buildUserWithDetails(), platformRole: "MODERATOR" } as never);
    });

    it("leaves the authority reference off the queue pages", async () => {
      prisma.report.findMany.mockResolvedValue([referenced()] as never);

      const response = await request(httpServer).get(adminPath("reports")).set(authHeader()).expect(200);

      const [item] = (response.body as { data: { items: Record<string, unknown>[] } }).data.items;
      expect(item).toMatchObject({ id: TEST_REPORT_ID, reporterId: TEST_USER_ID, holdReason: "CHILD_SAFETY" });
      expect(item).not.toHaveProperty("authorityReference");
      expect(JSON.stringify(response.body)).not.toContain("CT-2026-0001");
    });

    it("returns it on the single report", async () => {
      prisma.report.findUnique.mockResolvedValue(referenced() as never);

      const response = await request(httpServer)
        .get(adminPath(`reports/${TEST_REPORT_ID}`))
        .set(authHeader())
        .expect(200);

      expect((response.body as { data: Record<string, unknown> }).data).toMatchObject({
        id: TEST_REPORT_ID,
        authorityReference: "CT-2026-0001",
      });
    });
  });
});
