import { INestApplication } from "@nestjs/common";
import { AccessLevel, PrismaClient, ReportReason, ReportStatus, ReportTargetType } from "generated/prisma/client";
import { Server } from "http";
import { DeepMockProxy, mockReset } from "jest-mock-extended";
import { encodeKeysetCursor } from "src/common/pagination/keyset-cursor";
import { PAGINATION_ERRORS } from "src/common/pagination/pagination.constants";
import { EVENT_SERVICE_ERRORS } from "src/events/events.constants";
import {
  BLOCK_SERVICE_ERRORS,
  REPORT_NOTE_MAX_LENGTH,
  REPORT_SERVICE_ERRORS,
} from "src/moderation/moderation.constants";
import { PHOTO_SERVICE_ERRORS } from "src/photos/photos.constants";
import { S3Service } from "src/sdk/aws/s3/s3.service";
import { API_GLOBAL_PREFIX } from "src/swagger/swagger.config";
import { USER_SERVICE_ERRORS } from "src/users/users.constants";
import request from "supertest";
import { TEST_TARGET_USER_ID, authHeader } from "./helpers/auth.fixtures";
import { createTestApp } from "./helpers/create-test-app";
import {
  TEST_EVENT_ID,
  buildEvent,
  buildOrganizerAccess,
  buildParticipantAccess,
  buildTargetParticipantAccess,
  buildViewerAccess,
} from "./helpers/events.fixtures";
import {
  TEST_REPORT_ID,
  buildBlock,
  buildMemberReport,
  buildReport,
  expectedReportResponse,
} from "./helpers/moderation.fixtures";
import { TEST_PHOTO_ID, buildPhoto } from "./helpers/photos.fixtures";
import { TEST_NOW, TEST_USER_ID, buildUserWithDetails, buildUserWithoutDetails } from "./helpers/users.fixtures";

const photoReportsPath = (photoId = TEST_PHOTO_ID) => `/${API_GLOBAL_PREFIX}/photos/${photoId}/reports`;
const memberReportsPath = (targetUserId = TEST_TARGET_USER_ID, eventId = TEST_EVENT_ID) =>
  `/${API_GLOBAL_PREFIX}/events/${eventId}/participants/${targetUserId}/reports`;
const eventReportsPath = (eventId = TEST_EVENT_ID) => `/${API_GLOBAL_PREFIX}/events/${eventId}/reports`;
const reportPath = (reportId = TEST_REPORT_ID) => `/${API_GLOBAL_PREFIX}/reports/${reportId}`;
const blocksPath = `/${API_GLOBAL_PREFIX}/users/me/blocks`;
const blockPath = (userId = TEST_TARGET_USER_ID) => `${blocksPath}/${userId}`;

type WrappedResponse<T> = {
  data: T;
  meta: { timestamp: string; path: string };
};

type ErrorResponse = {
  message?: string;
  meta: { timestamp: string; path: string };
};

type ReportBody = ReturnType<typeof expectedReportResponse>;
type ReportListBody = { items: ReportBody[]; nextCursor: string | null };
type BlockedUserBody = { userId: string; name: string | null; username: string | null; blockedAt: string };

describe("Moderation (integration)", () => {
  let app: INestApplication;
  let prisma: DeepMockProxy<PrismaClient>;
  let httpServer: Server;
  const s3Service = { deleteObject: jest.fn(), deleteObjects: jest.fn() };

  type Access = ReturnType<typeof buildOrganizerAccess>;

  const eventWithAccess = (access: Access[]) => ({ ...buildEvent(), eventAccesses: access });

  /** The target user's photo, loaded the way the report path loads it. */
  const photoWithAccess = (access: Access[], overrides: Parameters<typeof buildPhoto>[0] = {}) => ({
    ...buildPhoto({ addedById: TEST_TARGET_USER_ID, ...overrides }),
    event: { ...eventWithAccess(access), _count: { eventAccesses: 5 } },
  });

  const reportWithAccess = (access: Access[], overrides: Parameters<typeof buildReport>[0] = {}) => ({
    ...buildReport({ reporterId: "99999999-9999-4999-8999-999999999999", ...overrides }),
    event: eventWithAccess(access),
  });

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
    // Defaults: nothing reported yet, the photo is visible, the target is an ordinary member.
    prisma.report.findFirst.mockResolvedValue(null);
    prisma.report.groupBy.mockResolvedValue([]);
    prisma.report.count.mockResolvedValue(1);
    prisma.photo.count.mockResolvedValue(1);
    prisma.eventAccess.findUnique.mockResolvedValue(buildTargetParticipantAccess());
    prisma.$transaction.mockImplementation(async (fn) => (fn as (tx: unknown) => Promise<unknown>)(prisma));
    s3Service.deleteObject.mockReset().mockResolvedValue(undefined);
    s3Service.deleteObjects.mockReset().mockResolvedValue({ deleted: [], failed: [] });
  });

  describe("POST /photos/:photoId/reports", () => {
    const payload = { reason: ReportReason.NUDITY_OR_SEXUAL, note: "Not okay for a family album" };

    it("returns 201 with the report, and never the reporter, for a member of the event", async () => {
      const report = buildReport(payload);
      prisma.photo.findUnique.mockResolvedValue(photoWithAccess([buildViewerAccess()]) as never);
      prisma.report.createManyAndReturn.mockResolvedValue([report]);

      const response = await request(httpServer).post(photoReportsPath()).set(authHeader()).send(payload).expect(201);

      const body = response.body as WrappedResponse<ReportBody>;
      expect(body.data).toEqual(expectedReportResponse(report));
      expect(body.data).not.toHaveProperty("reporterId");
      expect(body.meta.path).toBe(photoReportsPath());
      expect(prisma.report.createManyAndReturn).toHaveBeenCalledWith({
        data: [expect.objectContaining({ reporterId: TEST_USER_ID, photoId: TEST_PHOTO_ID, targetType: "PHOTO" })],
        skipDuplicates: true,
      });
    });

    it("returns 201 with the existing report, creating nothing, when the caller already has an OPEN one", async () => {
      const existing = buildReport({ reason: ReportReason.SPAM });
      prisma.photo.findUnique.mockResolvedValue(photoWithAccess([buildParticipantAccess()]) as never);
      // Their open report is what hides the photo from them by now.
      prisma.photo.count.mockResolvedValue(0);
      prisma.report.findFirst.mockResolvedValue(existing);

      const response = await request(httpServer).post(photoReportsPath()).set(authHeader()).send(payload).expect(201);

      const body = response.body as WrappedResponse<ReportBody>;
      expect(body.data).toEqual(expectedReportResponse(existing));
      expect(prisma.report.createManyAndReturn).not.toHaveBeenCalled();
    });

    it.each([
      ["an unknown reason", { reason: "BORING" }],
      ["a missing reason", { note: "no reason given" }],
      ["a note over the length cap", { reason: ReportReason.OTHER, note: "x".repeat(REPORT_NOTE_MAX_LENGTH + 1) }],
      ["an unknown property", { reason: ReportReason.OTHER, reporterId: TEST_TARGET_USER_ID }],
    ])("returns 400 for %s", async (_label, body) => {
      await request(httpServer).post(photoReportsPath()).set(authHeader()).send(body).expect(400);

      expect(prisma.photo.findUnique).not.toHaveBeenCalled();
    });

    it("returns 400 when the photo id is not a UUID", async () => {
      await request(httpServer).post(photoReportsPath("not-a-uuid")).set(authHeader()).send(payload).expect(400);
    });

    it("returns 401 when the access token is missing", async () => {
      await request(httpServer).post(photoReportsPath()).send(payload).expect(401);
    });

    it("returns 403 when the caller is not a member of the photo's event", async () => {
      prisma.photo.findUnique.mockResolvedValue(photoWithAccess([]) as never);

      const response = await request(httpServer).post(photoReportsPath()).set(authHeader()).send(payload).expect(403);

      const body = response.body as ErrorResponse;
      expect(body.message).toBe(REPORT_SERVICE_ERRORS.CREATE_FORBIDDEN(TEST_EVENT_ID));
    });

    it("returns 403 when the caller has not completed onboarding", async () => {
      prisma.user.findUnique.mockResolvedValue(buildUserWithoutDetails());
      prisma.photo.findUnique.mockResolvedValue(photoWithAccess([buildParticipantAccess()]) as never);

      await request(httpServer).post(photoReportsPath()).set(authHeader()).send(payload).expect(403);
    });

    it("returns 403 when the caller reports their own photo", async () => {
      prisma.photo.findUnique.mockResolvedValue(
        photoWithAccess([buildParticipantAccess()], { addedById: TEST_USER_ID }) as never,
      );

      const response = await request(httpServer).post(photoReportsPath()).set(authHeader()).send(payload).expect(403);

      const body = response.body as ErrorResponse;
      expect(body.message).toBe(REPORT_SERVICE_ERRORS.CANNOT_REPORT_SELF);
    });

    it("returns 404 when the photo does not exist", async () => {
      prisma.photo.findUnique.mockResolvedValue(null);

      const response = await request(httpServer).post(photoReportsPath()).set(authHeader()).send(payload).expect(404);

      const body = response.body as ErrorResponse;
      expect(body.message).toBe(PHOTO_SERVICE_ERRORS.NOT_FOUND(TEST_PHOTO_ID));
    });

    it("returns 404 when the photo is hidden from the caller, as its read would", async () => {
      prisma.photo.findUnique.mockResolvedValue(photoWithAccess([buildParticipantAccess()]) as never);
      prisma.photo.count.mockResolvedValue(0);

      await request(httpServer).post(photoReportsPath()).set(authHeader()).send(payload).expect(404);

      expect(prisma.report.createManyAndReturn).not.toHaveBeenCalled();
    });
  });

  describe("POST /events/:eventId/participants/:targetUserId/reports", () => {
    const payload = { reason: ReportReason.HARASSMENT };

    it("returns 201 with the report for a member reporting another member", async () => {
      const report = buildMemberReport(payload);
      prisma.event.findUnique.mockResolvedValue(eventWithAccess([buildParticipantAccess()]));
      prisma.report.createManyAndReturn.mockResolvedValue([report]);

      const response = await request(httpServer).post(memberReportsPath()).set(authHeader()).send(payload).expect(201);

      const body = response.body as WrappedResponse<ReportBody>;
      expect(body.data).toEqual(expectedReportResponse(report));
      expect(body.data.photoId).toBeNull();
    });

    it("returns 401 when the access token is missing", async () => {
      await request(httpServer).post(memberReportsPath()).send(payload).expect(401);
    });

    it("returns 403 when the caller is not a member of the event", async () => {
      prisma.event.findUnique.mockResolvedValue(eventWithAccess([]));

      const response = await request(httpServer).post(memberReportsPath()).set(authHeader()).send(payload).expect(403);

      const body = response.body as ErrorResponse;
      expect(body.message).toBe(REPORT_SERVICE_ERRORS.CREATE_FORBIDDEN(TEST_EVENT_ID));
    });

    it("returns 403 when the caller reports themselves", async () => {
      prisma.event.findUnique.mockResolvedValue(eventWithAccess([buildParticipantAccess()]));

      const response = await request(httpServer)
        .post(memberReportsPath(TEST_USER_ID))
        .set(authHeader())
        .send(payload)
        .expect(403);

      const body = response.body as ErrorResponse;
      expect(body.message).toBe(REPORT_SERVICE_ERRORS.CANNOT_REPORT_SELF);
    });

    it("returns 403 when the reported user is not a member of the event", async () => {
      prisma.event.findUnique.mockResolvedValue(eventWithAccess([buildParticipantAccess()]));
      prisma.eventAccess.findUnique.mockResolvedValue(null);

      const response = await request(httpServer).post(memberReportsPath()).set(authHeader()).send(payload).expect(403);

      const body = response.body as ErrorResponse;
      expect(body.message).toBe(EVENT_SERVICE_ERRORS.NOT_A_MEMBER(TEST_EVENT_ID, TEST_TARGET_USER_ID));
    });

    it("returns 404 when the event does not exist", async () => {
      prisma.event.findUnique.mockResolvedValue(null);

      const response = await request(httpServer).post(memberReportsPath()).set(authHeader()).send(payload).expect(404);

      const body = response.body as ErrorResponse;
      expect(body.message).toBe(EVENT_SERVICE_ERRORS.NOT_FOUND(TEST_EVENT_ID));
    });
  });

  describe("GET /events/:eventId/reports", () => {
    it("returns 200 with a page of reports for an organizer", async () => {
      const first = buildReport();
      const second = buildMemberReport({ id: "dddddddd-2222-4222-8333-dddddddddddd" });
      prisma.event.findUnique.mockResolvedValue(eventWithAccess([buildOrganizerAccess()]));
      prisma.report.findMany.mockResolvedValue([first, second]);

      const response = await request(httpServer)
        .get(eventReportsPath())
        .query({ status: ReportStatus.OPEN, limit: 1 })
        .set(authHeader())
        .expect(200);

      const body = response.body as WrappedResponse<ReportListBody>;
      expect(body.data.items).toEqual([expectedReportResponse(first)]);
      expect(body.data.nextCursor).toBe(encodeKeysetCursor(first));
      expect(prisma.report.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { AND: [{ eventId: TEST_EVENT_ID, status: "OPEN" }, expect.anything()] },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: 2,
        }),
      );
    });

    it("returns 400 for an unknown status", async () => {
      await request(httpServer).get(eventReportsPath()).query({ status: "PENDING" }).set(authHeader()).expect(400);
    });

    it("returns 400 for a malformed cursor", async () => {
      prisma.event.findUnique.mockResolvedValue(eventWithAccess([buildOrganizerAccess()]));

      const response = await request(httpServer)
        .get(eventReportsPath())
        .query({ cursor: "not-a-cursor" })
        .set(authHeader())
        .expect(400);

      const body = response.body as ErrorResponse;
      expect(body.message).toBe(PAGINATION_ERRORS.INVALID_CURSOR);
      expect(prisma.report.findMany).not.toHaveBeenCalled();
    });

    it("returns 401 when the access token is missing", async () => {
      await request(httpServer).get(eventReportsPath()).expect(401);
    });

    it.each([
      ["a participant", [buildParticipantAccess()]],
      ["a viewer", [buildViewerAccess()]],
      ["not a member", []],
    ])("returns 403 when the caller is %s", async (_label, access) => {
      prisma.event.findUnique.mockResolvedValue(eventWithAccess(access));

      const response = await request(httpServer).get(eventReportsPath()).set(authHeader()).expect(403);

      const body = response.body as ErrorResponse;
      expect(body.message).toBe(REPORT_SERVICE_ERRORS.LIST_FORBIDDEN(TEST_EVENT_ID));
      expect(prisma.report.findMany).not.toHaveBeenCalled();
    });

    it("returns 404 when the event does not exist", async () => {
      prisma.event.findUnique.mockResolvedValue(null);

      await request(httpServer).get(eventReportsPath()).set(authHeader()).expect(404);
    });
  });

  describe("PATCH /reports/:reportId", () => {
    const patch = (body: object) => request(httpServer).patch(reportPath()).set(authHeader()).send(body);
    const resolvedAs = (status: ReportStatus) =>
      buildReport({ status, resolvedById: TEST_USER_ID, resolvedAt: TEST_NOW });

    const setup = (
      report = reportWithAccess([buildOrganizerAccess()]),
      status: ReportStatus = ReportStatus.ACTIONED,
    ) => {
      prisma.report.findUnique.mockResolvedValue(report as never);
      prisma.photo.findUnique.mockResolvedValue(buildPhoto({ addedById: TEST_TARGET_USER_ID }));
      prisma.report.updateManyAndReturn.mockResolvedValue([resolvedAs(status)]);
      prisma.report.updateMany.mockResolvedValue({ count: 0 });
      prisma.photo.deleteMany.mockResolvedValue({ count: 1 });
      prisma.eventAccess.deleteMany.mockResolvedValue({ count: 1 });
    };

    it("REMOVE_PHOTO returns 200, deletes the photo and its object, and resolves the report as ACTIONED", async () => {
      setup();

      const response = await patch({ action: "REMOVE_PHOTO" }).expect(200);

      const body = response.body as WrappedResponse<ReportBody>;
      expect(body.data).toEqual(expectedReportResponse(resolvedAs(ReportStatus.ACTIONED)));
      expect(prisma.report.updateManyAndReturn).toHaveBeenCalledWith({
        where: { id: TEST_REPORT_ID, status: "OPEN" },
        data: { status: "ACTIONED", resolvedById: TEST_USER_ID, resolvedAt: expect.any(Date) as unknown },
      });
      expect(prisma.photo.deleteMany).toHaveBeenCalledWith({ where: { id: TEST_PHOTO_ID } });
      expect(s3Service.deleteObject).toHaveBeenCalledTimes(1);
      expect(prisma.eventAccess.deleteMany).not.toHaveBeenCalled();
    });

    it("REMOVE_MEMBER returns 200 and removes the reported member from the event", async () => {
      setup(reportWithAccess([buildOrganizerAccess()], { targetType: ReportTargetType.MEMBER, photoId: null }));

      await patch({ action: "REMOVE_MEMBER" }).expect(200);

      expect(prisma.eventAccess.deleteMany).toHaveBeenCalledWith({
        where: { eventId: TEST_EVENT_ID, userId: TEST_TARGET_USER_ID },
      });
      expect(prisma.photo.deleteMany).not.toHaveBeenCalled();
    });

    it("REMOVE_MEMBER bans the member from rejoining the event", async () => {
      setup(reportWithAccess([buildOrganizerAccess()], { targetType: ReportTargetType.MEMBER, photoId: null }));

      await patch({ action: "REMOVE_MEMBER" }).expect(200);

      expect(prisma.eventBan.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: { eventId: TEST_EVENT_ID, userId: TEST_TARGET_USER_ID, bannedById: TEST_USER_ID },
        }),
      );
    });

    it("REMOVE_MEMBER with photos=DELETE deletes the member's other photos and purges their objects", async () => {
      setup(reportWithAccess([buildOrganizerAccess()], { targetType: ReportTargetType.MEMBER, photoId: null }));
      prisma.photo.findMany.mockResolvedValue([{ id: TEST_PHOTO_ID, s3Key: "photos/u/e/p" }] as never);
      s3Service.deleteObjects.mockResolvedValue({ deleted: ["photos/u/e/p"], failed: [] });

      await patch({ action: "REMOVE_MEMBER", photos: "DELETE" }).expect(200);

      expect(prisma.photo.deleteMany).toHaveBeenCalledWith({ where: { id: { in: [TEST_PHOTO_ID] } } });
      expect(s3Service.deleteObjects).toHaveBeenCalledWith(["photos/u/e/p"]);
    });

    it("returns 400 for photos with any action other than REMOVE_MEMBER", async () => {
      const response = await patch({ action: "DISMISS", photos: "DELETE" }).expect(400);

      const body = response.body as ErrorResponse;
      expect(body.message).toBe(REPORT_SERVICE_ERRORS.PHOTOS_ONLY_WITH_REMOVE_MEMBER);
      expect(prisma.report.findUnique).not.toHaveBeenCalled();
    });

    it("DISMISS returns 200, resolves the report as DISMISSED, and removes nothing", async () => {
      setup(reportWithAccess([buildOrganizerAccess()]), ReportStatus.DISMISSED);

      const response = await patch({ action: "DISMISS" }).expect(200);

      const body = response.body as WrappedResponse<ReportBody>;
      expect(body.data.status).toBe("DISMISSED");
      expect(prisma.photo.deleteMany).not.toHaveBeenCalled();
      expect(prisma.eventAccess.deleteMany).not.toHaveBeenCalled();
      expect(s3Service.deleteObject).not.toHaveBeenCalled();
    });

    it.each([{ action: "DELETE" }, { status: "DISMISSED" }, {}, { action: "REMOVE_MEMBER", photos: "SOME" }])(
      "returns 400 for the body %j",
      async (body) => {
        await patch(body).expect(400);

        expect(prisma.report.findUnique).not.toHaveBeenCalled();
      },
    );

    it("returns 400 for REMOVE_PHOTO on a report about a member", async () => {
      setup(reportWithAccess([buildOrganizerAccess()], { targetType: ReportTargetType.MEMBER, photoId: null }));

      const response = await patch({ action: "REMOVE_PHOTO" }).expect(400);

      const body = response.body as ErrorResponse;
      expect(body.message).toBe(REPORT_SERVICE_ERRORS.REMOVE_PHOTO_NOT_A_PHOTO_REPORT);
    });

    it("returns 422 for REMOVE_PHOTO when the photo is already gone", async () => {
      setup(reportWithAccess([buildOrganizerAccess()], { photoId: null }));

      const response = await patch({ action: "REMOVE_PHOTO" }).expect(422);

      const body = response.body as ErrorResponse;
      expect(body.message).toBe(REPORT_SERVICE_ERRORS.REPORTED_PHOTO_GONE);
      expect(prisma.report.updateManyAndReturn).not.toHaveBeenCalled();
    });

    it("returns 401 when the access token is missing", async () => {
      await request(httpServer).patch(reportPath()).send({ action: "DISMISS" }).expect(401);
    });

    it("returns 403 when the caller is not an organizer of the report's event", async () => {
      setup(reportWithAccess([buildParticipantAccess()]));

      const response = await patch({ action: "DISMISS" }).expect(403);

      const body = response.body as ErrorResponse;
      expect(body.message).toBe(REPORT_SERVICE_ERRORS.RESOLVE_FORBIDDEN(TEST_REPORT_ID));
    });

    it("returns 403 when an organizer resolves a report made against themselves", async () => {
      setup(reportWithAccess([buildOrganizerAccess()], { reportedUserId: TEST_USER_ID }));

      const response = await patch({ action: "DISMISS" }).expect(403);

      const body = response.body as ErrorResponse;
      expect(body.message).toBe(REPORT_SERVICE_ERRORS.CANNOT_RESOLVE_OWN);
      expect(prisma.report.updateManyAndReturn).not.toHaveBeenCalled();
    });

    it("returns 404 when the report does not exist", async () => {
      prisma.report.findUnique.mockResolvedValue(null);

      const response = await patch({ action: "DISMISS" }).expect(404);

      const body = response.body as ErrorResponse;
      expect(body.message).toBe(REPORT_SERVICE_ERRORS.NOT_FOUND(TEST_REPORT_ID));
    });

    it("returns 409 and removes nothing when the report has already been resolved", async () => {
      setup(reportWithAccess([buildOrganizerAccess()], { status: ReportStatus.DISMISSED, resolvedAt: TEST_NOW }));
      prisma.report.updateManyAndReturn.mockResolvedValue([]);

      const response = await patch({ action: "REMOVE_PHOTO" }).expect(409);

      const body = response.body as ErrorResponse;
      expect(body.message).toBe(REPORT_SERVICE_ERRORS.ALREADY_RESOLVED(TEST_REPORT_ID));
      expect(prisma.photo.deleteMany).not.toHaveBeenCalled();
      expect(s3Service.deleteObject).not.toHaveBeenCalled();
    });
  });

  describe("PUT /users/me/blocks/:userId", () => {
    beforeEach(() => {
      prisma.eventAccess.findFirst.mockResolvedValue(buildTargetParticipantAccess({ accessLevel: AccessLevel.VIEWER }));
      prisma.userBlock.createMany.mockResolvedValue({ count: 1 });
      prisma.userBlock.findUniqueOrThrow.mockResolvedValue(buildBlock());
    });

    it("returns 200 with the blocked user", async () => {
      const response = await request(httpServer).put(blockPath()).set(authHeader()).expect(200);

      const body = response.body as WrappedResponse<BlockedUserBody>;
      expect(body.data).toEqual({
        userId: TEST_TARGET_USER_ID,
        name: "Target User",
        username: "target",
        blockedAt: TEST_NOW.toISOString(),
      });
      expect(prisma.userBlock.createMany).toHaveBeenCalledWith({
        data: [{ blockerId: TEST_USER_ID, blockedId: TEST_TARGET_USER_ID }],
        skipDuplicates: true,
      });
    });

    it("returns 200 again, not a conflict, when the user is already blocked", async () => {
      prisma.userBlock.createMany.mockResolvedValue({ count: 0 });

      await request(httpServer).put(blockPath()).set(authHeader()).expect(200);
    });

    it("returns 400 when the user id is not a UUID", async () => {
      await request(httpServer).put(blockPath("someone")).set(authHeader()).expect(400);
    });

    it("returns 401 when the access token is missing", async () => {
      await request(httpServer).put(blockPath()).expect(401);
    });

    it("returns 403 when the caller blocks themselves", async () => {
      const response = await request(httpServer).put(blockPath(TEST_USER_ID)).set(authHeader()).expect(403);

      const body = response.body as ErrorResponse;
      expect(body.message).toBe(BLOCK_SERVICE_ERRORS.CANNOT_BLOCK_SELF);
    });

    it("returns the same 404 for a user who shares no event with the caller as for one who does not exist", async () => {
      prisma.eventAccess.findFirst.mockResolvedValue(null);

      const response = await request(httpServer).put(blockPath()).set(authHeader()).expect(404);

      const body = response.body as ErrorResponse;
      expect(body.message).toBe(USER_SERVICE_ERRORS.NOT_FOUND(TEST_TARGET_USER_ID));
      expect(prisma.userBlock.createMany).not.toHaveBeenCalled();
    });
  });

  describe("GET /users/me/blocks", () => {
    it("returns 200 with the users the caller has blocked", async () => {
      prisma.userBlock.findMany.mockResolvedValue([buildBlock()]);

      const response = await request(httpServer).get(blocksPath).set(authHeader()).expect(200);

      const body = response.body as WrappedResponse<{ items: BlockedUserBody[] }>;
      expect(body.data.items).toEqual([
        { userId: TEST_TARGET_USER_ID, name: "Target User", username: "target", blockedAt: TEST_NOW.toISOString() },
      ]);
      expect(prisma.userBlock.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { blockerId: TEST_USER_ID } }),
      );
    });

    it("returns 401 when the access token is missing", async () => {
      await request(httpServer).get(blocksPath).expect(401);
    });
  });

  describe("DELETE /users/me/blocks/:userId", () => {
    it("returns 204 and removes the caller's block", async () => {
      prisma.userBlock.deleteMany.mockResolvedValue({ count: 1 });

      await request(httpServer).delete(blockPath()).set(authHeader()).expect(204);

      expect(prisma.userBlock.deleteMany).toHaveBeenCalledWith({
        where: { blockerId: TEST_USER_ID, blockedId: TEST_TARGET_USER_ID },
      });
    });

    it("returns 204 when the user was not blocked", async () => {
      prisma.userBlock.deleteMany.mockResolvedValue({ count: 0 });

      await request(httpServer).delete(blockPath()).set(authHeader()).expect(204);
    });

    it("returns 400 when the user id is not a UUID", async () => {
      await request(httpServer).delete(blockPath("someone")).set(authHeader()).expect(400);
    });

    it("returns 401 when the access token is missing", async () => {
      await request(httpServer).delete(blockPath()).expect(401);
    });
  });
});
