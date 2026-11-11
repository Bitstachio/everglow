import { INestApplication } from "@nestjs/common";
import { PrismaClient } from "generated/prisma/client";
import { Server } from "http";
import { DeepMockProxy, mockReset } from "jest-mock-extended";
import { PhotoScreeningService } from "src/moderation/screening/photo-screening.service";
import { RekognitionService } from "src/sdk/aws/rekognition/rekognition.service";
import { S3Service } from "src/sdk/aws/s3/s3.service";
import { API_GLOBAL_PREFIX } from "src/swagger/swagger.config";
import request from "supertest";
import { authHeader } from "./helpers/auth.fixtures";
import { TestAppContext, createTestApp } from "./helpers/create-test-app";
import { TEST_EVENT_ID, buildEvent, buildParticipantAccess } from "./helpers/events.fixtures";
import { buildReport } from "./helpers/moderation.fixtures";
import { TEST_PHOTO_ID, buildPhoto } from "./helpers/photos.fixtures";
import { buildFreePlan } from "./helpers/plans.fixtures";
import { TEST_USER_ID, buildUserWithDetails } from "./helpers/users.fixtures";

const confirmPath = () => `/${API_GLOBAL_PREFIX}/events/${TEST_EVENT_ID}/photos/confirm`;
const photosListPath = () => `/${API_GLOBAL_PREFIX}/events/${TEST_EVENT_ID}/photos`;

type ConfirmResultBody = { data: { photoId: string; status: string }[] };

/**
 * Upload screening switched on (docs/moderation.md §11), with Rekognition and
 * S3 stubbed: nothing here reaches AWS.
 */
describe("Upload screening (integration)", () => {
  let app: INestApplication;
  let prisma: DeepMockProxy<PrismaClient>;
  let evidence: TestAppContext["evidence"];
  let httpServer: Server;
  const previous = process.env.MODERATION_SCREENING_ENABLED;

  const s3Service = {
    getBucket: jest.fn(),
    headObject: jest.fn(),
    deleteObjects: jest.fn(),
    getPresignedUploadUrl: jest.fn(),
    getPresignedDownloadUrl: jest.fn(),
    sha256OfObject: jest.fn(),
    getObjectBytes: jest.fn(),
  };
  const rekognition = { detectModerationLabels: jest.fn() };
  const displayCopyBytes = new Uint8Array([0xff, 0xd8, 0xff]);

  const eventWithAccess = () => ({
    ...buildEvent(),
    eventAccesses: [buildParticipantAccess()],
    _count: { eventAccesses: 5 },
  });

  beforeAll(async () => {
    // Read when the config loads, so it is set before the app is built.
    process.env.MODERATION_SCREENING_ENABLED = "true";
    const context = await createTestApp((builder) =>
      builder
        .overrideProvider(S3Service)
        .useValue(s3Service)
        .overrideProvider(RekognitionService)
        .useValue(rekognition),
    );
    app = context.app;
    prisma = context.prisma;
    evidence = context.evidence;
    httpServer = app.getHttpServer() as Server;
  });

  afterAll(async () => {
    await app.close();
    if (previous === undefined) delete process.env.MODERATION_SCREENING_ENABLED;
    else process.env.MODERATION_SCREENING_ENABLED = previous;
  });

  beforeEach(() => {
    mockReset(prisma);
    jest.clearAllMocks();
    prisma.plan.findUnique.mockResolvedValue(buildFreePlan());
    prisma.plan.findFirst.mockResolvedValue(buildFreePlan());
    prisma.user.findUnique.mockResolvedValue(buildUserWithDetails());
    prisma.report.groupBy.mockResolvedValue([]);
    prisma.$transaction.mockImplementation(async (fn) => fn(prisma));
    prisma.event.findUnique.mockResolvedValue(eventWithAccess() as never);
    prisma.photo.findMany.mockResolvedValue([buildPhoto({ status: "PENDING" })]);
    prisma.photo.updateMany.mockResolvedValue({ count: 1 });
    prisma.reportEvidence.findMany.mockResolvedValue([]);
    s3Service.headObject.mockResolvedValue({ exists: true, contentType: "image/jpeg", sizeBytes: 1024 });
    s3Service.sha256OfObject.mockResolvedValue("5e".repeat(32));
    s3Service.getObjectBytes.mockResolvedValue(displayCopyBytes);
    s3Service.getPresignedDownloadUrl.mockResolvedValue("https://signed");
    rekognition.detectModerationLabels.mockResolvedValue([]);
  });

  const confirm = () =>
    request(httpServer)
      .post(confirmPath())
      .set(authHeader())
      .send({ photoIds: [TEST_PHOTO_ID] })
      .expect(201);

  it("confirms a flagged photo as READY, hidden behind an automated report for the platform", async () => {
    rekognition.detectModerationLabels.mockResolvedValue([
      { name: "Graphic Violence", parentName: "Violence", confidence: 96 },
    ]);
    prisma.report.createManyAndReturn.mockResolvedValue([
      buildReport({ reporterId: null, source: "AUTOMATED", queue: "PLATFORM", reason: "VIOLENCE" }),
    ]);

    const response = await confirm();

    expect((response.body as ConfirmResultBody).data).toEqual([{ photoId: TEST_PHOTO_ID, status: "READY" }]);
    expect(s3Service.getObjectBytes).toHaveBeenCalledWith(
      `derived/${buildPhoto().s3Key}/large.jpg`,
      expect.objectContaining({ abortSignal: expect.any(AbortSignal) as unknown }),
    );
    expect(rekognition.detectModerationLabels).toHaveBeenCalledWith(displayCopyBytes, 80, expect.any(AbortSignal));
    expect(prisma.photo.updateMany).toHaveBeenCalledWith({
      where: { id: TEST_PHOTO_ID },
      data: { status: "READY", sha256: "5e".repeat(32), screening: "FLAGGED", screeningHeldUntil: null },
    });
    expect(prisma.report.createManyAndReturn).toHaveBeenCalledWith({
      skipDuplicates: true,
      data: [
        expect.objectContaining({
          reporterId: null,
          source: "AUTOMATED",
          photoId: TEST_PHOTO_ID,
          reportedUserId: TEST_USER_ID,
          reason: "VIOLENCE",
          queue: "PLATFORM",
          escalationReasons: ["AUTOMATED_FLAG", "SEVERE_REASON"],
        }),
      ],
    });
    expect(evidence.writeSnapshot).toHaveBeenCalled();
  });

  it("still confirms when Rekognition is down, holding the photo for the screening job", async () => {
    rekognition.detectModerationLabels.mockRejectedValue(
      Object.assign(new Error("unavailable"), { name: "ServiceUnavailableException" }),
    );

    const response = await confirm();

    expect((response.body as ConfirmResultBody).data).toEqual([{ photoId: TEST_PHOTO_ID, status: "READY" }]);
    expect(prisma.photo.updateMany).toHaveBeenCalledWith({
      where: { id: TEST_PHOTO_ID },
      data: expect.objectContaining({
        status: "READY",
        screening: "PENDING",
        screeningHeldUntil: expect.any(Date) as unknown,
      }) as unknown,
    });
    expect(prisma.report.createManyAndReturn).not.toHaveBeenCalled();
  });

  it("lists a member's roll without held photos, except their own, and without automatically flagged ones", async () => {
    prisma.photo.findMany.mockResolvedValue([]);

    await request(httpServer).get(photosListPath()).set(authHeader()).expect(200);

    const { where } = prisma.photo.findMany.mock.calls[0][0]!;
    const filters = JSON.stringify(where);
    expect(filters).toContain('"screeningHeldUntil":null');
    expect(filters).toContain(`"addedById":"${TEST_USER_ID}"`);
    expect(filters).toContain('"source":"AUTOMATED"');
  });

  it("screens held photos from the job, and files the report for one it flags", async () => {
    const photo = buildPhoto({ screening: "PENDING", screeningHeldUntil: new Date(Date.now() + 60_000) });
    prisma.photo.findMany.mockResolvedValue([{ ...photo, event: { title: "Roll" } }] as never);
    rekognition.detectModerationLabels.mockResolvedValue([{ name: "Explicit", parentName: "", confidence: 99 }]);
    prisma.report.createManyAndReturn.mockResolvedValue([
      buildReport({ reporterId: null, source: "AUTOMATED", queue: "PLATFORM", reason: "NUDITY_OR_SEXUAL" }),
    ]);

    await expect(app.get(PhotoScreeningService).screenHeld()).resolves.toMatchObject({ screened: 1, flagged: 1 });

    expect(prisma.photo.updateMany).toHaveBeenCalledWith({
      where: { id: photo.id, screening: "PENDING" },
      data: { screening: "FLAGGED", screeningHeldUntil: null },
    });
    expect(prisma.report.createManyAndReturn).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [expect.objectContaining({ eventTitle: "Roll", reason: "NUDITY_OR_SEXUAL", source: "AUTOMATED" })],
      }),
    );
  });
});
