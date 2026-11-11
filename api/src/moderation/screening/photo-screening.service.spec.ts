import { ConfigService } from "@nestjs/config";
import { PrismaClient } from "generated/prisma/client";
import { DeepMockProxy, mockDeep } from "jest-mock-extended";
import { PinoLogger } from "nestjs-pino";
import { PrismaService } from "src/prisma/prisma.service";
import { RekognitionService } from "src/sdk/aws/rekognition/rekognition.service";
import { S3Service } from "src/sdk/aws/s3/s3.service";
import { EvidenceService } from "../evidence/evidence.service";
import { buildEvidenceServiceMock } from "../evidence/testing/evidence-service.mock";
import { PhotoScreeningService } from "./photo-screening.service";
import { UploadScreeningService } from "./upload-screening.service";

describe("PhotoScreeningService", () => {
  const now = new Date("2026-11-11T12:00:00.000Z");
  const eventId = "66666666-6666-6666-6666-666666666666";
  const uploaderId = "22222222-2222-2222-2222-222222222222";

  let prisma: DeepMockProxy<PrismaClient>;
  let s3Service: { getObjectBytes: jest.Mock };
  let rekognition: { detectModerationLabels: jest.Mock };
  let logger: { setContext: jest.Mock; info: jest.Mock; warn: jest.Mock; error: jest.Mock };
  let config: Record<string, unknown>;
  let service: PhotoScreeningService;

  const held = (id: string, overrides: Record<string, unknown> = {}) => ({
    id,
    eventId,
    s3Key: `photos/${eventId}/${id}`,
    contentType: "image/jpeg",
    sizeBytes: 12 * 1024 * 1024,
    addedById: uploaderId,
    // Still within its hold unless a test says otherwise.
    screeningHeldUntil: new Date(now.getTime() + 10 * 60_000),
    event: { title: "Sam & Jo" },
    ...overrides,
  });

  beforeEach(() => {
    prisma = mockDeep<PrismaClient>();
    prisma.$transaction.mockImplementation(async (fn) => (fn as (tx: unknown) => Promise<unknown>)(prisma));
    prisma.photo.updateMany.mockResolvedValue({ count: 1 });
    prisma.report.createManyAndReturn.mockResolvedValue([
      { id: "report-1", eventId, source: "AUTOMATED", queue: "PLATFORM", escalationReasons: [] } as never,
    ]);
    s3Service = { getObjectBytes: jest.fn().mockResolvedValue(new Uint8Array([1])) };
    rekognition = { detectModerationLabels: jest.fn().mockResolvedValue([]) };
    logger = { setContext: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    config = {
      "moderation.screeningEnabled": true,
      "moderation.screeningMinConfidence": 80,
      "moderation.screeningTimeoutMs": 5000,
      "moderation.screeningMaxHoldMinutes": 30,
      "moderation.screeningBatchSize": 50,
    };
    const configService = {
      get: (key: string) => config[key],
      getOrThrow: (key: string) => config[key],
    } as unknown as ConfigService;
    const screening = new UploadScreeningService(
      configService,
      s3Service as unknown as S3Service,
      rekognition as unknown as RekognitionService,
      buildEvidenceServiceMock() as unknown as EvidenceService,
      logger as unknown as PinoLogger,
    );
    service = new PhotoScreeningService(
      prisma as unknown as PrismaService,
      screening,
      configService,
      logger as unknown as PinoLogger,
    );
  });

  it("does nothing when no photo is held", async () => {
    prisma.photo.findMany.mockResolvedValue([]);

    await expect(service.screenHeld(now)).resolves.toEqual({
      screened: 0,
      cleared: 0,
      flagged: 0,
      skipped: 0,
      stillHeld: 0,
    });
    expect(rekognition.detectModerationLabels).not.toHaveBeenCalled();
  });

  it("takes held READY photos, soonest deadline first, a batch at a time", async () => {
    prisma.photo.findMany.mockResolvedValue([]);

    await service.screenHeld(now);

    expect(prisma.photo.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: "READY", screening: "PENDING" },
        orderBy: [{ screeningHeldUntil: "asc" }, { id: "asc" }],
        take: 50,
      }),
    );
  });

  it("clears a photo now screenable, and ends its hold, only while it is still held", async () => {
    prisma.photo.findMany.mockResolvedValue([held("p-1")] as never);

    await expect(service.screenHeld(now)).resolves.toMatchObject({ screened: 1, cleared: 1, stillHeld: 0 });

    expect(prisma.photo.updateMany).toHaveBeenCalledWith({
      where: { id: "p-1", screening: "PENDING" },
      data: { screening: "CLEARED", screeningHeldUntil: null },
    });
  });

  it("flags a held photo and files its automated report with the update", async () => {
    prisma.photo.findMany.mockResolvedValue([held("p-1")] as never);
    rekognition.detectModerationLabels.mockResolvedValue([
      { name: "Graphic Violence", parentName: "Violence", confidence: 93 },
    ]);

    await expect(service.screenHeld(now)).resolves.toMatchObject({ flagged: 1 });

    expect(prisma.photo.updateMany).toHaveBeenCalledWith({
      where: { id: "p-1", screening: "PENDING" },
      data: { screening: "FLAGGED", screeningHeldUntil: null },
    });
    expect(prisma.report.createManyAndReturn).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          expect.objectContaining({
            eventTitle: "Sam & Jo",
            photoId: "p-1",
            reason: "VIOLENCE",
            source: "AUTOMATED",
            queue: "PLATFORM",
          }),
        ],
      }),
    );
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ event: "photo.screening.flagged", photoId: "p-1", trigger: "screening_job" }),
      expect.any(String),
    );
  });

  it("files nothing when another run already took the photo off hold", async () => {
    prisma.photo.findMany.mockResolvedValue([held("p-1")] as never);
    prisma.photo.updateMany.mockResolvedValue({ count: 0 });
    rekognition.detectModerationLabels.mockResolvedValue([{ name: "Explicit", parentName: "", confidence: 99 }]);

    await expect(service.screenHeld(now)).resolves.toMatchObject({ screened: 1, flagged: 0 });
    expect(prisma.report.createManyAndReturn).not.toHaveBeenCalled();
  });

  it("keeps a photo held while it still can't be screened and its hold hasn't run out", async () => {
    prisma.photo.findMany.mockResolvedValue([held("p-1")] as never);
    s3Service.getObjectBytes.mockResolvedValue(null);

    await expect(service.screenHeld(now)).resolves.toMatchObject({ screened: 1, stillHeld: 1 });
    expect(prisma.photo.updateMany).not.toHaveBeenCalled();
  });

  it("publishes a photo unchecked once its hold has run out, and warns", async () => {
    prisma.photo.findMany.mockResolvedValue([held("p-1", { screeningHeldUntil: now })] as never);
    rekognition.detectModerationLabels.mockRejectedValue(
      Object.assign(new Error("down"), { name: "InternalServerError" }),
    );

    await expect(service.screenHeld(now)).resolves.toMatchObject({ skipped: 1, stillHeld: 0 });

    expect(prisma.photo.updateMany).toHaveBeenCalledWith({
      where: { id: "p-1", screening: "PENDING" },
      data: { screening: "SKIPPED", screeningHeldUntil: null },
    });
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ event: "photo.screening.skipped", photoId: "p-1", reason: "hold_expired" }),
      expect.any(String),
    );
  });

  it("handles each photo on its own: one failure doesn't hold up the rest", async () => {
    prisma.photo.findMany.mockResolvedValue([held("p-1"), held("p-2")] as never);
    rekognition.detectModerationLabels
      .mockRejectedValueOnce(Object.assign(new Error("slow down"), { name: "ThrottlingException" }))
      .mockResolvedValueOnce([]);

    await expect(service.screenHeld(now)).resolves.toMatchObject({ screened: 2, cleared: 1, stillHeld: 1 });
  });
});
