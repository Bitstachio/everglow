import { Test, TestingModule } from "@nestjs/testing";
import { PinoLogger } from "nestjs-pino";
import { S3Service } from "src/sdk/aws/s3/s3.service";
import { PhotoPurgeService } from "./photo-purge.service";
import { EvidenceService } from "src/moderation/evidence/evidence.service";
import { buildEvidenceServiceMock, EvidenceServiceMock } from "src/moderation/evidence/testing/evidence-service.mock";

describe("PhotoPurgeService", () => {
  let evidenceService: EvidenceServiceMock;
  let service: PhotoPurgeService;
  let s3Service: { deleteObjects: jest.Mock };
  let logger: { setContext: jest.Mock; info: jest.Mock; error: jest.Mock };

  const context = {
    event: "event.photos.purged",
    eventId: "66666666-6666-6666-6666-666666666666",
    callerId: "11111111-1111-1111-1111-111111111111",
  };
  const keys = ["photos/u/e/a", "photos/u/e/b", "photos/u/e/c"];
  const derived = (key: string) => [`derived/${key}/thumb.webp`, `derived/${key}/large.jpg`];
  // What one DeleteObjects batch holds for these originals: each with its two copies.
  const batchFor = (originals: string[]) => originals.flatMap((key) => [key, ...derived(key)]);

  beforeEach(async () => {
    s3Service = { deleteObjects: jest.fn() };
    logger = { setContext: jest.fn(), info: jest.fn(), error: jest.fn() };

    evidenceService = buildEvidenceServiceMock();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PhotoPurgeService,
        { provide: S3Service, useValue: s3Service },
        { provide: EvidenceService, useValue: evidenceService },
        { provide: PinoLogger, useValue: logger },
      ],
    }).compile();

    service = module.get(PhotoPurgeService);
  });

  it("deletes the objects and logs an audit summary", async () => {
    s3Service.deleteObjects.mockResolvedValue({ deleted: batchFor(keys), failed: [] });

    const result = await service.purgeObjects(keys, context);

    expect(result).toEqual({ requested: 3, deleted: 3, failed: 0, retained: 0, derivativesFailed: 0 });
    expect(s3Service.deleteObjects).toHaveBeenCalledTimes(1);
    expect(s3Service.deleteObjects).toHaveBeenCalledWith(batchFor(keys));
    expect(logger.info).toHaveBeenCalledWith({ ...context, ...result, audit: true }, expect.any(String));
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("reports partial failures at error level and does not throw", async () => {
    s3Service.deleteObjects.mockResolvedValue({
      deleted: keys.slice(0, 2),
      failed: [{ key: keys[2], code: "InternalError" }],
    });

    const result = await service.purgeObjects(keys, context);

    expect(result).toEqual({ requested: 3, deleted: 2, failed: 1, retained: 0, derivativesFailed: 0 });
    expect(logger.error).toHaveBeenCalledWith({ ...context, ...result, audit: true }, expect.any(String));
    expect(logger.info).not.toHaveBeenCalled();
  });

  it("counts every key as failed when the S3 call itself fails, without throwing", async () => {
    s3Service.deleteObjects.mockRejectedValue(new Error("s3 down"));

    await expect(service.purgeObjects(keys, context)).resolves.toEqual({
      requested: 3,
      deleted: 0,
      failed: 3,
      retained: 0,
      derivativesFailed: 0,
    });
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ ...context, failed: 3, audit: true }),
      expect.any(String),
    );
  });

  it("does nothing for an event without photos", async () => {
    await expect(service.purgeObjects([], context)).resolves.toEqual({
      requested: 0,
      deleted: 0,
      failed: 0,
      retained: 0,
      derivativesFailed: 0,
    });

    expect(s3Service.deleteObjects).not.toHaveBeenCalled();
    expect(logger.info).not.toHaveBeenCalled();
  });

  it("copies reported objects to evidence first, and keeps the ones whose copy failed", async () => {
    evidenceService.preserveBeforeDelete.mockResolvedValue({ deletable: keys.slice(0, 2), retained: [keys[2]] });
    s3Service.deleteObjects.mockResolvedValue({ deleted: keys.slice(0, 2), failed: [] });

    const result = await service.purgeObjects(keys, context);

    expect(evidenceService.preserveBeforeDelete).toHaveBeenCalledWith(keys);
    // The retained original keeps its copies: they go when the evidence job deletes it.
    expect(s3Service.deleteObjects).toHaveBeenCalledTimes(1);
    expect(s3Service.deleteObjects).toHaveBeenCalledWith(batchFor(keys.slice(0, 2)));
    expect(result).toEqual({ requested: 3, deleted: 2, failed: 0, retained: 1, derivativesFailed: 0 });
  });

  it("deletes nothing when every key is kept for evidence", async () => {
    evidenceService.preserveBeforeDelete.mockResolvedValue({ deletable: [], retained: keys });

    await expect(service.purgeObjects(keys, context)).resolves.toEqual({
      requested: 3,
      deleted: 0,
      failed: 0,
      retained: 3,
      derivativesFailed: 0,
    });
    expect(s3Service.deleteObjects).not.toHaveBeenCalled();
  });

  it("deletes a cover purged with the photos without derived keys", async () => {
    const cover = "event-covers/e/c";
    s3Service.deleteObjects.mockResolvedValue({ deleted: [...batchFor([keys[0]]), cover], failed: [] });

    const result = await service.purgeObjects([keys[0], cover], context);

    expect(s3Service.deleteObjects).toHaveBeenCalledWith([...batchFor([keys[0]]), cover]);
    expect(result).toEqual({ requested: 2, deleted: 2, failed: 0, retained: 0, derivativesFailed: 0 });
  });

  it("counts derived keys that fail apart from the originals and logs them at error level", async () => {
    const [thumb] = derived(keys[0]);
    s3Service.deleteObjects.mockResolvedValue({
      deleted: batchFor(keys).filter((key) => key !== thumb),
      failed: [{ key: thumb, code: "InternalError" }],
    });

    const result = await service.purgeObjects(keys, context);

    expect(result).toEqual({ requested: 3, deleted: 3, failed: 0, retained: 0, derivativesFailed: 1 });
    expect(logger.error).toHaveBeenCalledWith({ ...context, ...result, audit: true }, expect.any(String));
  });
});
