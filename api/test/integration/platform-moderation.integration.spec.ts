import { INestApplication } from "@nestjs/common";
import { PrismaClient } from "generated/prisma/client";
import { Server } from "http";
import { DeepMockProxy, mockReset } from "jest-mock-extended";
import { S3Service } from "src/sdk/aws/s3/s3.service";
import { API_GLOBAL_PREFIX } from "src/swagger/swagger.config";
import request from "supertest";
import { authHeader } from "./helpers/auth.fixtures";
import { createTestApp } from "./helpers/create-test-app";
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
    getPresignedDownloadUrl: jest.fn().mockResolvedValue("https://s3.example/get?sig=1"),
  };

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
    ["POST", `reports/${TEST_REPORT_ID}/evidence-url`],
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

  it("gives a moderator a short-lived link to the reported object", async () => {
    asModerator();
    prisma.report.findUnique.mockResolvedValue(reportWithEvidence() as never);

    const response = await request(httpServer)
      .post(adminPath(`reports/${TEST_REPORT_ID}/evidence-url`))
      .set(authHeader())
      .expect(201);

    expect(response.body).toMatchObject({ data: { url: "https://s3.example/get?sig=1" } });
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
