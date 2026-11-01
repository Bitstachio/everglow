import { INestApplication } from "@nestjs/common";
import { PrismaClient } from "generated/prisma/client";
import { Server } from "http";
import { DeepMockProxy, mockReset } from "jest-mock-extended";
import { Readable } from "node:stream";
import { MemberlessEventPurgeService } from "src/moderation/evidence/memberless-event-purge.service";
import { EvidenceServiceMock } from "src/moderation/evidence/testing/evidence-service.mock";
import { S3Service } from "src/sdk/aws/s3/s3.service";
import { API_GLOBAL_PREFIX } from "src/swagger/swagger.config";
import request from "supertest";
import { authHeader } from "./helpers/auth.fixtures";
import { createTestApp } from "./helpers/create-test-app";
import { expectApiError } from "./helpers/expect-api-error";
import { TEST_EVENT_ID } from "./helpers/events.fixtures";
import { TEST_REPORT_ID, buildReport } from "./helpers/moderation.fixtures";
import { TEST_USER_ID, buildUserWithDetails } from "./helpers/users.fixtures";

const adminPath = (path: string) => `/${API_GLOBAL_PREFIX}/admin/${path}`;

describe("Platform moderation (integration)", () => {
  let app: INestApplication;
  let prisma: DeepMockProxy<PrismaClient>;
  let httpServer: Server;
  const s3Service = {
    deleteObject: jest.fn(),
    deleteObjects: jest.fn(),
    getObjectStream: jest.fn(),
  };
  let evidence: EvidenceServiceMock;

  const reportWithEvidence = (overrides: Parameters<typeof buildReport>[0] = {}) => ({
    ...buildReport({ queue: "PLATFORM", ...overrides }),
    evidence: {
      id: "ev-1",
      reportId: TEST_REPORT_ID,
      objectS3Key: "photos/u/e/p",
      contentType: "image/jpeg",
      sizeBytes: 1024,
      evidenceS3Key: null,
      sha256: null,
      quarantinedAt: null,
      quarantineFailedAt: null,
      subjectUserId: null,
      subjectUsername: "uploader",
      createdAt: new Date(),
    },
  });

  const asModerator = () =>
    prisma.user.findUnique.mockResolvedValue({ ...buildUserWithDetails(), platformRole: "MODERATOR" } as never);

  beforeAll(async () => {
    const context = await createTestApp((builder) => builder.overrideProvider(S3Service).useValue(s3Service));
    app = context.app;
    prisma = context.prisma;
    evidence = context.evidence;
    httpServer = app.getHttpServer() as Server;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    mockReset(prisma);
    prisma.user.findUnique.mockResolvedValue(buildUserWithDetails());
    prisma.$transaction.mockImplementation(async (fn) => (fn as (tx: unknown) => Promise<unknown>)(prisma));
  });

  it.each([
    ["GET", "reports"],
    ["GET", `reports/${TEST_REPORT_ID}`],
    ["GET", `reports/${TEST_REPORT_ID}/evidence`],
    ["PATCH", `reports/${TEST_REPORT_ID}`],
    ["POST", `events/${TEST_EVENT_ID}/lift-review`],
  ])("answers 403 PLATFORM_MODERATOR_ONLY to anyone else on %s /admin/%s", async (method, path) => {
    const response = await request(httpServer)
      [method.toLowerCase() as "get" | "post" | "patch"](adminPath(path))
      .set(authHeader())
      .send({ action: "DISMISS" })
      .expect(403);

    expect(response.body).toMatchObject({ code: "PLATFORM_MODERATOR_ONLY" });
    expect(prisma.report.findMany).not.toHaveBeenCalled();
  });

  it("lists the platform's queue with who filed each report and its evidence summary", async () => {
    asModerator();
    prisma.report.findMany.mockResolvedValue([reportWithEvidence()] as never);

    const response = await request(httpServer).get(adminPath("reports")).set(authHeader()).expect(200);

    const body = response.body as { data: { items: Record<string, unknown>[]; nextCursor: string | null } };
    expect(body.data.items).toHaveLength(1);
    expect(body.data.items[0]).toMatchObject({
      id: TEST_REPORT_ID,
      queue: "PLATFORM",
      reporterId: TEST_USER_ID,
      evidence: { quarantined: false, subjectUsername: "uploader" },
    });
    // The snapshot's keys never leave the API.
    expect(JSON.stringify(body)).not.toContain("photos/u/e/p");
  });

  describe("evidence", () => {
    const bytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

    beforeEach(() => {
      s3Service.getObjectStream.mockReset();
      s3Service.getObjectStream.mockImplementation(() =>
        Promise.resolve({ body: Readable.from([bytes]), contentType: "image/jpeg", contentLength: bytes.length }),
      );
    });

    it("streams the reported object to a moderator, uncached and with no URL to forward", async () => {
      asModerator();
      prisma.report.findUnique.mockResolvedValue(reportWithEvidence() as never);

      const response = await request(httpServer)
        .get(adminPath(`reports/${TEST_REPORT_ID}/evidence`))
        .set(authHeader())
        .buffer(true)
        .parse((res, done) => {
          const chunks: Buffer[] = [];
          res.on("data", (chunk: Buffer) => chunks.push(chunk));
          res.on("end", () => done(null, Buffer.concat(chunks)));
        })
        .expect(200);

      expect(response.headers["content-type"]).toBe("image/jpeg");
      expect(response.headers["cache-control"]).toBe("no-store");
      expect(response.headers["content-length"]).toBe(String(bytes.length));
      expect(response.body).toEqual(bytes);
      expect(s3Service.getObjectStream).toHaveBeenCalledWith("photos/u/e/p");
    });

    it("refuses a closed report that isn't held with 403 EVIDENCE_REPORT_CLOSED", async () => {
      asModerator();
      prisma.report.findUnique.mockResolvedValue(reportWithEvidence({ status: "DISMISSED" }) as never);

      const response = await request(httpServer)
        .get(adminPath(`reports/${TEST_REPORT_ID}/evidence`))
        .set(authHeader())
        .expect(403);

      expectApiError(response.body, "EVIDENCE_REPORT_CLOSED", { reportId: TEST_REPORT_ID });
      expect(s3Service.getObjectStream).not.toHaveBeenCalled();
    });

    it("opens a closed report that is held", async () => {
      asModerator();
      prisma.report.findUnique.mockResolvedValue(
        reportWithEvidence({ status: "ACTIONED", holdUntil: new Date(Date.now() + 86_400_000) }) as never,
      );

      await request(httpServer)
        .get(adminPath(`reports/${TEST_REPORT_ID}/evidence`))
        .set(authHeader())
        .expect(200);
    });

    it("answers 404 EVIDENCE_NOT_AVAILABLE when the object is gone", async () => {
      asModerator();
      prisma.report.findUnique.mockResolvedValue(reportWithEvidence() as never);
      s3Service.getObjectStream.mockResolvedValue(null);

      const response = await request(httpServer)
        .get(adminPath(`reports/${TEST_REPORT_ID}/evidence`))
        .set(authHeader())
        .expect(404);

      expectApiError(response.body, "EVIDENCE_NOT_AVAILABLE", { reportId: TEST_REPORT_ID });
    });
  });

  describe("holds", () => {
    it("refuses a hold in the past with 400", async () => {
      asModerator();
      prisma.report.findUnique.mockResolvedValue(reportWithEvidence() as never);

      await request(httpServer)
        .put(adminPath(`reports/${TEST_REPORT_ID}/hold`))
        .set(authHeader())
        .send({ until: "2020-01-01T00:00:00.000Z", reason: "LEGAL" })
        .expect(400);
      expect(prisma.report.update).not.toHaveBeenCalled();
    });

    it("refuses a hold more than 3 years away with 400", async () => {
      asModerator();
      prisma.report.findUnique.mockResolvedValue(reportWithEvidence() as never);
      const tooFar = new Date(Date.now() + 4 * 365 * 86_400_000).toISOString();

      await request(httpServer)
        .put(adminPath(`reports/${TEST_REPORT_ID}/hold`))
        .set(authHeader())
        .send({ until: tooFar, reason: "LEGAL" })
        .expect(400);
    });

    it("sets a hold within 3 years", async () => {
      asModerator();
      prisma.report.findUnique.mockResolvedValue(reportWithEvidence() as never);
      prisma.report.update.mockResolvedValue(reportWithEvidence() as never);
      const until = new Date(Date.now() + 90 * 86_400_000);

      await request(httpServer)
        .put(adminPath(`reports/${TEST_REPORT_ID}/hold`))
        .set(authHeader())
        .send({ until: until.toISOString(), reason: "LAW_ENFORCEMENT" })
        .expect(200);
      expect(prisma.report.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { holdUntil: until, holdReason: "LAW_ENFORCEMENT" } }),
      );
    });

    it("discards an actioned intimate image's evidence copy when its hold is released", async () => {
      asModerator();
      prisma.report.findUnique.mockResolvedValue(
        reportWithEvidence({
          reason: "NON_CONSENSUAL_INTIMATE_IMAGE",
          status: "ACTIONED",
          holdUntil: new Date(Date.now() + 86_400_000),
          holdReason: "LEGAL",
        }) as never,
      );

      await request(httpServer)
        .delete(adminPath(`reports/${TEST_REPORT_ID}/hold`))
        .set(authHeader())
        .expect(200);

      expect(prisma.report.update).toHaveBeenCalledWith({
        where: { id: TEST_REPORT_ID },
        data: { holdUntil: null, holdReason: null },
      });
      expect(evidence.discardImages).toHaveBeenCalledWith([TEST_REPORT_ID], expect.any(Date));
    });
  });

  it("dismisses a report as the platform", async () => {
    asModerator();
    prisma.report.findUnique.mockResolvedValue(reportWithEvidence() as never);
    prisma.report.updateManyAndReturn
      .mockResolvedValueOnce([buildReport({ status: "DISMISSED" })])
      .mockResolvedValueOnce([]);

    await request(httpServer)
      .patch(adminPath(`reports/${TEST_REPORT_ID}`))
      .set(authHeader())
      .send({ action: "DISMISS" })
      .expect(200);

    expect(prisma.report.updateManyAndReturn).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "DISMISSED",
          closedByRole: "PLATFORM",
          resolvedById: TEST_USER_ID,
        }) as unknown,
      }),
    );
  });

  describe("dismissing event reports", () => {
    const eventReport = (overrides: Parameters<typeof buildReport>[0] = {}) =>
      reportWithEvidence({ targetType: "EVENT", photoId: null, reportedUserId: null, ...overrides });
    const underReviewAt = new Date("2026-10-30T12:00:00.000Z");

    beforeEach(() => {
      asModerator();
      prisma.report.findUnique.mockResolvedValue(eventReport() as never);
      prisma.report.updateManyAndReturn
        .mockResolvedValueOnce([buildReport({ targetType: "EVENT", status: "DISMISSED" })])
        .mockResolvedValueOnce([]);
      prisma.$queryRaw.mockResolvedValue([{ underReviewAt }]);
    });

    it("lifts the review in the same transaction when the last OPEN event report is dismissed", async () => {
      prisma.report.count.mockResolvedValue(0);

      await request(httpServer)
        .patch(adminPath(`reports/${TEST_REPORT_ID}`))
        .set(authHeader())
        .send({ action: "DISMISS" })
        .expect(200);

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.report.count).toHaveBeenCalledWith({
        where: { eventId: TEST_EVENT_ID, targetType: "EVENT", status: "OPEN" },
      });
      expect(prisma.event.update).toHaveBeenCalledWith({ where: { id: TEST_EVENT_ID }, data: { underReviewAt: null } });
    });

    it("keeps the review while another event report is OPEN", async () => {
      prisma.report.count.mockResolvedValue(1);

      await request(httpServer)
        .patch(adminPath(`reports/${TEST_REPORT_ID}`))
        .set(authHeader())
        .send({ action: "DISMISS" })
        .expect(200);

      expect(prisma.event.update).not.toHaveBeenCalled();
    });
  });

  describe("memberless events", () => {
    it("deletes an event with no members and nothing pending, purging its photos through the normal purge", async () => {
      prisma.event.findMany.mockResolvedValue([{ id: TEST_EVENT_ID }] as never);
      prisma.$queryRaw.mockResolvedValue([{ underReviewAt: null }]);
      prisma.report.count.mockResolvedValue(0);
      prisma.eventAccess.count.mockResolvedValue(0);
      prisma.photo.findMany.mockResolvedValue([{ s3Key: "photos/u/e/p" }] as never);
      prisma.event.findUnique.mockResolvedValue({ coverS3Key: null } as never);
      prisma.event.deleteMany.mockResolvedValue({ count: 1 });
      s3Service.deleteObjects.mockImplementation((keys: string[]) => Promise.resolve({ deleted: keys, failed: [] }));

      await expect(app.get(MemberlessEventPurgeService).run()).resolves.toEqual({
        memberlessEventsDeleted: 1,
        memberlessEventsKept: 0,
      });

      expect(prisma.event.deleteMany).toHaveBeenCalledWith({ where: { id: TEST_EVENT_ID } });
      // Evidence first: the purge asks for every reported object to be copied before it deletes.
      expect(evidence.preserveBeforeDelete).toHaveBeenCalledWith(["photos/u/e/p"]);
      expect(s3Service.deleteObjects).toHaveBeenCalledWith(expect.arrayContaining(["photos/u/e/p"]));
    });

    it("keeps one with an OPEN report", async () => {
      prisma.event.findMany.mockResolvedValue([{ id: TEST_EVENT_ID }] as never);
      prisma.$queryRaw.mockResolvedValue([{ underReviewAt: null }]);
      prisma.report.count.mockResolvedValue(2);

      await expect(app.get(MemberlessEventPurgeService).run()).resolves.toEqual({
        memberlessEventsDeleted: 0,
        memberlessEventsKept: 1,
      });
      expect(prisma.event.deleteMany).not.toHaveBeenCalled();
    });
  });

  it("lifts an event's review", async () => {
    asModerator();
    prisma.event.findUnique.mockResolvedValue({ underReviewAt: new Date() } as never);

    await request(httpServer)
      .post(adminPath(`events/${TEST_EVENT_ID}/lift-review`))
      .set(authHeader())
      .expect(204);

    expect(prisma.event.update).toHaveBeenCalledWith({ where: { id: TEST_EVENT_ID }, data: { underReviewAt: null } });
  });
});
