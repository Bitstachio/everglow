import { INestApplication } from "@nestjs/common";
import {
  AccessLevel,
  Prisma,
  PrismaClient,
  ReportReason,
  ReportStatus,
  ReportTargetType,
} from "generated/prisma/client";
import { Server } from "http";
import { DeepMockProxy, mockReset } from "jest-mock-extended";
import { BAD_REQUEST_CODE, NOT_FOUND_CODE } from "src/common/errors/http.errors";
import { REPORT_DISMISSAL_COOLDOWN_DAYS, SEVERE_REPORT_REASONS } from "src/moderation/moderation.constants";
import { S3Service } from "src/sdk/aws/s3/s3.service";
import { API_GLOBAL_PREFIX } from "src/swagger/swagger.config";
import request from "supertest";
import {
  TEST_APPLE_USER_ID,
  TEST_OTHER_ACCESS_TOKEN,
  TEST_OTHER_USER_ID,
  TEST_TARGET_USER_ID,
  authHeader,
} from "./helpers/auth.fixtures";
import { createTestApp } from "./helpers/create-test-app";
import {
  TEST_EVENT_ID,
  TEST_INVITE_TOKEN,
  buildEvent,
  buildEventInvite,
  buildOrganizerAccess,
  buildOtherUserWithDetails,
  buildParticipantAccess,
  buildTargetParticipantAccess,
  eventWithCallerAccess,
} from "./helpers/events.fixtures";
import { expectApiError } from "./helpers/expect-api-error";
import { TEST_REPORT_ID, buildMemberReport, buildReport } from "./helpers/moderation.fixtures";
import { TEST_PHOTO_ID, buildPhoto } from "./helpers/photos.fixtures";
import { buildFreePlan } from "./helpers/plans.fixtures";
import { TEST_USER_ID, buildUserWithDetails } from "./helpers/users.fixtures";

/**
 * What a verdict, a removal or a dismissal does around the report it is about
 * (EV-197, docs/moderation.md §2, §3, §5, §6, §8): hidden photos stay hidden,
 * removed reporters stop counting, dismissed reports can't come straight back.
 */
describe("Verdict side effects (integration)", () => {
  let app: INestApplication;
  let prisma: DeepMockProxy<PrismaClient>;
  let httpServer: Server;
  const s3Service = { deleteObject: jest.fn(), deleteObjects: jest.fn() };

  const api = (path: string) => `/${API_GLOBAL_PREFIX}/${path}`;
  const photoReportsPath = api(`photos/${TEST_PHOTO_ID}/reports`);
  const memberReportsPath = api(`events/${TEST_EVENT_ID}/participants/${TEST_TARGET_USER_ID}/reports`);
  const eventReportsPath = api(`events/${TEST_EVENT_ID}/reports`);

  const eventWithAccess = (access: ReturnType<typeof buildOrganizerAccess>[], overrides = {}) => ({
    ...buildEvent(overrides),
    eventAccesses: access,
    _count: { eventAccesses: 5 },
  });
  const photoWithAccess = (access: ReturnType<typeof buildOrganizerAccess>[]) => ({
    ...buildPhoto({ addedById: TEST_TARGET_USER_ID }),
    event: eventWithAccess(access),
  });

  /** The closures every `report.updateMany` call asked for, in order. */
  const closures = () => prisma.report.updateMany.mock.calls.map(([args]) => args);

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
    prisma.plan.findUnique.mockResolvedValue(buildFreePlan());
    prisma.plan.findFirst.mockResolvedValue(buildFreePlan());
    prisma.userBlock.findMany.mockResolvedValue([]);
    prisma.report.findFirst.mockResolvedValue(null);
    prisma.report.groupBy.mockResolvedValue([] as never);
    prisma.report.count.mockResolvedValue(1);
    prisma.report.findMany.mockResolvedValue([]);
    prisma.report.updateMany.mockResolvedValue({ count: 0 });
    prisma.$queryRaw.mockResolvedValue([]);
    prisma.photo.count.mockResolvedValue(1);
    prisma.photo.findMany.mockResolvedValue([]);
    prisma.eventAccess.findUnique.mockResolvedValue(buildTargetParticipantAccess());
    prisma.eventAccess.deleteMany.mockResolvedValue({ count: 1 });
    prisma.eventAccess.count.mockResolvedValue(1);
    s3Service.deleteObject.mockReset().mockResolvedValue(undefined);
    s3Service.deleteObjects.mockReset().mockResolvedValue({ deleted: [], failed: [] });
  });

  describe("REMOVE_MEMBER keeping the member's photos", () => {
    // Member M (the target user) uploaded P1, which three members reported for
    // nudity, so it is hidden from everyone but organizers. Another member
    // reports M for harassment, and an organizer removes M, keeping photos.
    it("closes only the member reports, so the reports hiding P1 stay OPEN and P1 stays hidden", async () => {
      const harassment = buildMemberReport({
        reporterId: TEST_OTHER_USER_ID,
        reportedUserId: TEST_TARGET_USER_ID,
        reason: ReportReason.HARASSMENT,
      });
      prisma.report.findUnique.mockResolvedValue({
        ...harassment,
        event: eventWithAccess([buildOrganizerAccess()]),
      } as never);
      prisma.report.updateManyAndReturn.mockResolvedValue([{ ...harassment, status: ReportStatus.ACTIONED }]);

      await request(httpServer)
        .patch(api(`reports/${TEST_REPORT_ID}`))
        .set(authHeader())
        .send({ action: "REMOVE_MEMBER", photos: "KEEP" })
        .expect(200);

      // The settled reports: member reports about M, and nothing on M's photos.
      expect(closures()[0]).toEqual({
        where: {
          AND: [
            { id: { not: TEST_REPORT_ID } },
            { status: "OPEN" },
            { queue: "ORGANIZERS" },
            { eventId: TEST_EVENT_ID, reportedUserId: TEST_TARGET_USER_ID, OR: [{ targetType: "MEMBER" }] },
          ],
        },
        data: expect.objectContaining({ status: "ACTIONED", closedReason: "MEMBER_REMOVED" }) as unknown,
      });
      // The only other closure is of the reports M filed: theirs, not about them.
      expect(closures()).toHaveLength(2);
      expect(closures()[1].where).toMatchObject({ reporterId: TEST_TARGET_USER_ID, eventId: TEST_EVENT_ID });
      expect(prisma.photo.deleteMany).not.toHaveBeenCalled();
    });

    it("does the same for the platform's REMOVE_MEMBER, in either queue", async () => {
      prisma.user.findUnique.mockResolvedValue({ ...buildUserWithDetails(), platformRole: "MODERATOR" } as never);
      const harassment = buildMemberReport({ reporterId: TEST_OTHER_USER_ID, queue: "PLATFORM" });
      prisma.report.findUnique.mockResolvedValue({ ...harassment, evidence: null } as never);
      prisma.report.updateManyAndReturn.mockResolvedValue([{ ...harassment, status: ReportStatus.ACTIONED }]);

      await request(httpServer)
        .patch(api(`admin/reports/${TEST_REPORT_ID}`))
        .set(authHeader())
        .send({ action: "REMOVE_MEMBER" })
        .expect(200);

      expect(prisma.report.updateManyAndReturn).toHaveBeenNthCalledWith(2, {
        where: {
          AND: [
            { id: { not: TEST_REPORT_ID } },
            { status: "OPEN" },
            { eventId: TEST_EVENT_ID, reportedUserId: TEST_TARGET_USER_ID, OR: [{ targetType: "MEMBER" }] },
          ],
        },
        data: expect.objectContaining({ closedReason: "MEMBER_REMOVED", closedByRole: "PLATFORM" }) as unknown,
        select: { id: true },
      });
    });
  });

  describe("removing reporters", () => {
    // Three members reported a host's photo, which their reports hide; the
    // host removes and bans all three.
    it("closes each removed reporter's OPEN reports as REPORTER_REMOVED, so they stop counting", async () => {
      const reporters = [TEST_TARGET_USER_ID, TEST_OTHER_USER_ID, TEST_APPLE_USER_ID];
      prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(buildEvent(), [buildOrganizerAccess()]));
      prisma.report.updateMany.mockResolvedValue({ count: 1 });

      for (const reporter of reporters) {
        prisma.eventAccess.findUnique.mockResolvedValue(buildParticipantAccess({ userId: reporter }));
        await request(httpServer)
          .delete(api(`events/${TEST_EVENT_ID}/participants/${reporter}`))
          .set(authHeader())
          .expect(204);
      }

      expect(closures()).toEqual(
        reporters.map((reporter) => ({
          where: {
            eventId: TEST_EVENT_ID,
            reporterId: reporter,
            status: "OPEN",
            queue: "ORGANIZERS",
            reason: { notIn: [...SEVERE_REPORT_REASONS] },
          },
          data: {
            status: "DISMISSED",
            closedReason: "REPORTER_REMOVED",
            closedByRole: "ORGANIZER",
            resolvedById: TEST_USER_ID,
            resolvedAt: expect.any(Date) as unknown,
          },
        })),
      );
      expect(prisma.eventBan.upsert).toHaveBeenCalledTimes(3);
    });

    it("only OPEN reports count toward the hide threshold, so closing theirs shows the photo again", async () => {
      prisma.event.findUnique.mockResolvedValue({
        ...eventWithAccess([buildParticipantAccess({ userId: TEST_OTHER_USER_ID })]),
      } as never);
      prisma.photo.findMany.mockResolvedValue([]);

      await request(httpServer)
        .get(api(`events/${TEST_EVENT_ID}/photos`))
        .set(authHeader(TEST_OTHER_ACCESS_TOKEN))
        .expect(200);

      expect(prisma.report.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: "OPEN", photoId: { not: null } }) as unknown,
        }),
      );
    });
  });

  describe("reporting again after a dismissal", () => {
    const dismissed = (overrides: Parameters<typeof buildReport>[0] = {}) =>
      buildReport({ status: ReportStatus.DISMISSED, closedReason: "DISMISSED", resolvedAt: new Date(), ...overrides });

    it("refuses the same reporter on the same photo with 409 REPORT_RECENTLY_DISMISSED", async () => {
      prisma.photo.findUnique.mockResolvedValue(photoWithAccess([buildParticipantAccess()]) as never);
      prisma.report.findFirst.mockResolvedValue(dismissed());

      const response = await request(httpServer)
        .post(photoReportsPath)
        .set(authHeader())
        .send({ reason: ReportReason.SPAM })
        .expect(409);

      expectApiError(response.body, "REPORT_RECENTLY_DISMISSED", { days: REPORT_DISMISSAL_COOLDOWN_DAYS });
      expect(prisma.report.createManyAndReturn).not.toHaveBeenCalled();
      expect(prisma.report.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            reporterId: TEST_USER_ID,
            photoId: TEST_PHOTO_ID,
            status: "DISMISSED",
            resolvedAt: { gte: expect.any(Date) as unknown },
          }) as unknown,
        }),
      );
    });

    it("refuses the same reporter on the same member too", async () => {
      prisma.event.findUnique.mockResolvedValue(eventWithAccess([buildParticipantAccess()]) as never);
      prisma.report.findFirst.mockResolvedValue(dismissed({ targetType: ReportTargetType.MEMBER, photoId: null }));

      const response = await request(httpServer)
        .post(memberReportsPath)
        .set(authHeader())
        .send({ reason: ReportReason.HARASSMENT })
        .expect(409);

      expectApiError(response.body, "REPORT_RECENTLY_DISMISSED", { days: REPORT_DISMISSAL_COOLDOWN_DAYS });
      expect(prisma.report.createManyAndReturn).not.toHaveBeenCalled();
    });

    it("still takes a child-safety report, which only the platform judges", async () => {
      prisma.photo.findUnique.mockResolvedValue(photoWithAccess([buildParticipantAccess()]) as never);
      prisma.report.findFirst.mockResolvedValue(dismissed());
      prisma.report.createManyAndReturn.mockResolvedValue([
        buildReport({ reason: ReportReason.CHILD_SAFETY, queue: "PLATFORM" }),
      ]);

      await request(httpServer)
        .post(photoReportsPath)
        .set(authHeader())
        .send({ reason: ReportReason.CHILD_SAFETY })
        .expect(201);
    });
  });

  it("two reports by one user at the same moment give one row, and both get it back", async () => {
    const report = buildReport({ reason: ReportReason.SPAM });
    prisma.photo.findUnique.mockResolvedValue(photoWithAccess([buildParticipantAccess()]) as never);
    // The partial unique index lets one insert through; the other is skipped.
    prisma.report.createManyAndReturn.mockResolvedValueOnce([report]).mockResolvedValueOnce([]);
    prisma.report.findFirst.mockImplementation(((args: Prisma.ReportFindFirstArgs) =>
      Promise.resolve(args.where?.status === "OPEN" ? report : null)) as never);

    const [first, second] = await Promise.all(
      [0, 1].map(() => request(httpServer).post(photoReportsPath).set(authHeader()).send({ reason: "SPAM" })),
    );

    expect([first.status, second.status]).toEqual([201, 201]);
    expect((first.body as { data: { id: string } }).data.id).toBe(report.id);
    expect((second.body as { data: { id: string } }).data.id).toBe(report.id);
    expect(prisma.report.createManyAndReturn).toHaveBeenCalledTimes(2);
    for (const [args] of prisma.report.createManyAndReturn.mock.calls) {
      expect(args).toMatchObject({ skipDuplicates: true });
    }
  });

  describe("the report note", () => {
    it.each([
      ["only spaces", "   "],
      ["a NUL", "a\u0000b"],
      ["a control character", "a\u001bb"],
    ])("is a 400 with %s, on every report route, before anything is looked up", async (_label, note) => {
      for (const path of [photoReportsPath, memberReportsPath, eventReportsPath]) {
        const response = await request(httpServer)
          .post(path)
          .set(authHeader())
          .send({ reason: ReportReason.OTHER, note })
          .expect(400);
        expectApiError(response.body, BAD_REQUEST_CODE);
      }

      expect(prisma.photo.findUnique).not.toHaveBeenCalled();
      expect(prisma.event.findUnique).not.toHaveBeenCalled();
    });

    it("is stored trimmed, newlines inside kept", async () => {
      prisma.photo.findUnique.mockResolvedValue(photoWithAccess([buildParticipantAccess()]) as never);
      prisma.report.createManyAndReturn.mockResolvedValue([buildReport()]);

      await request(httpServer)
        .post(photoReportsPath)
        .set(authHeader())
        .send({ reason: ReportReason.OTHER, note: "  First line\nSecond line \n" })
        .expect(201);

      expect(prisma.report.createManyAndReturn).toHaveBeenCalledWith(
        expect.objectContaining({ data: [expect.objectContaining({ note: "First line\nSecond line" })] }),
      );
    });
  });

  describe("platform REMOVE_MEMBER", () => {
    beforeEach(() => {
      prisma.user.findUnique.mockResolvedValue({ ...buildUserWithDetails(), platformRole: "MODERATOR" } as never);
      prisma.report.findUnique.mockResolvedValue({
        ...buildMemberReport({ reporterId: TEST_OTHER_USER_ID, queue: "PLATFORM" }),
        evidence: null,
      } as never);
    });

    it("refuses to remove the event's only organizer with 422 LAST_ORGANIZER, changing nothing", async () => {
      prisma.eventAccess.findUnique.mockResolvedValue(
        buildParticipantAccess({ userId: TEST_TARGET_USER_ID, accessLevel: AccessLevel.ORGANIZER }),
      );
      prisma.eventAccess.count.mockResolvedValue(1);

      const response = await request(httpServer)
        .patch(api(`admin/reports/${TEST_REPORT_ID}`))
        .set(authHeader())
        .send({ action: "REMOVE_MEMBER" })
        .expect(422);

      expectApiError(response.body, "LAST_ORGANIZER", { eventId: TEST_EVENT_ID });
      expect(prisma.report.updateManyAndReturn).not.toHaveBeenCalled();
      expect(prisma.eventAccess.deleteMany).not.toHaveBeenCalled();
    });
  });

  describe("joining across an organizer's block", () => {
    it.each([
      ["suspended", { suspendedAt: new Date() }],
      ["under review", { underReviewAt: new Date() }],
    ])("answers the unknown-link 404 when the event is %s, as the invite preview does", async (_label, state) => {
      const event = buildEvent(state);
      prisma.user.findUnique.mockResolvedValue(buildOtherUserWithDetails());
      prisma.eventInvite.findUnique.mockResolvedValue(buildEventInvite({ eventId: event.id }));
      prisma.event.findUnique.mockResolvedValue(event);
      prisma.eventAccess.findUnique.mockResolvedValue(null);
      prisma.userBlock.findMany.mockResolvedValue([{ blockerId: TEST_USER_ID, blocked: { details: null } }] as never);

      const response = await request(httpServer)
        .post(api("events/join"))
        .set(authHeader(TEST_OTHER_ACCESS_TOKEN))
        .send({ invitationUrl: TEST_INVITE_TOKEN })
        .expect(404);

      expectApiError(response.body, NOT_FOUND_CODE);
      expect(prisma.eventAccess.create).not.toHaveBeenCalled();
    });
  });

  describe("suspending a moderator", () => {
    const asModeratorWith = (target: { platformRole: "MODERATOR" | null }) =>
      prisma.user.findUnique.mockImplementation(((args: Prisma.UserFindUniqueArgs) =>
        Promise.resolve(
          args.where.id === TEST_USER_ID
            ? { ...buildUserWithDetails(), platformRole: "MODERATOR", suspendedAt: null }
            : { suspendedAt: null, ...target },
        )) as never);

    it("refuses a moderator suspending themselves with 403 CANNOT_SUSPEND_MODERATOR", async () => {
      asModeratorWith({ platformRole: "MODERATOR" });

      const response = await request(httpServer)
        .post(api(`admin/users/${TEST_USER_ID}/suspend`))
        .set(authHeader())
        .expect(403);

      expectApiError(response.body, "CANNOT_SUSPEND_MODERATOR");
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it("refuses suspending another moderator", async () => {
      asModeratorWith({ platformRole: "MODERATOR" });

      const response = await request(httpServer)
        .post(api(`admin/users/${TEST_TARGET_USER_ID}/suspend`))
        .set(authHeader())
        .expect(403);

      expectApiError(response.body, "CANNOT_SUSPEND_MODERATOR");
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it("still suspends an ordinary account", async () => {
      asModeratorWith({ platformRole: null });
      prisma.eventAccess.findMany.mockResolvedValue([]);
      prisma.event.updateMany.mockResolvedValue({ count: 0 });

      await request(httpServer)
        .post(api(`admin/users/${TEST_TARGET_USER_ID}/suspend`))
        .set(authHeader())
        .expect(204);

      expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: TEST_TARGET_USER_ID } }));
    });
  });
});
