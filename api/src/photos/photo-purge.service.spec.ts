import { Test, TestingModule } from "@nestjs/testing";
import { PinoLogger } from "nestjs-pino";
import { S3Service } from "src/sdk/aws/s3/s3.service";
import { PhotoPurgeService } from "./photo-purge.service";

describe("PhotoPurgeService", () => {
  let service: PhotoPurgeService;
  let s3Service: { deleteObjects: jest.Mock };
  let logger: { setContext: jest.Mock; info: jest.Mock; error: jest.Mock };

  const context = {
    event: "event.photos.purged",
    eventId: "66666666-6666-6666-6666-666666666666",
    callerId: "11111111-1111-1111-1111-111111111111",
  };
  const keys = ["photos/u/e/a", "photos/u/e/b", "photos/u/e/c"];

  beforeEach(async () => {
    s3Service = { deleteObjects: jest.fn() };
    logger = { setContext: jest.fn(), info: jest.fn(), error: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PhotoPurgeService,
        { provide: S3Service, useValue: s3Service },
        { provide: PinoLogger, useValue: logger },
      ],
    }).compile();

    service = module.get(PhotoPurgeService);
  });

  it("deletes the objects and logs an audit summary", async () => {
    s3Service.deleteObjects.mockResolvedValue({ deleted: keys, failed: [] });

    const result = await service.purgeObjects(keys, context);

    expect(result).toEqual({ requested: 3, deleted: 3, failed: 0 });
    expect(s3Service.deleteObjects).toHaveBeenCalledWith(keys);
    expect(logger.info).toHaveBeenCalledWith({ ...context, ...result, audit: true }, expect.any(String));
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("reports partial failures at error level and does not throw", async () => {
    s3Service.deleteObjects.mockResolvedValue({
      deleted: keys.slice(0, 2),
      failed: [{ key: keys[2], code: "InternalError" }],
    });

    const result = await service.purgeObjects(keys, context);

    expect(result).toEqual({ requested: 3, deleted: 2, failed: 1 });
    expect(logger.error).toHaveBeenCalledWith({ ...context, ...result, audit: true }, expect.any(String));
    expect(logger.info).not.toHaveBeenCalled();
  });

  it("counts every key as failed when the S3 call itself fails, without throwing", async () => {
    s3Service.deleteObjects.mockRejectedValue(new Error("s3 down"));

    await expect(service.purgeObjects(keys, context)).resolves.toEqual({ requested: 3, deleted: 0, failed: 3 });
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ ...context, failed: 3, audit: true }),
      expect.any(String),
    );
  });

  it("does nothing for an event without photos", async () => {
    await expect(service.purgeObjects([], context)).resolves.toEqual({ requested: 0, deleted: 0, failed: 0 });

    expect(s3Service.deleteObjects).not.toHaveBeenCalled();
    expect(logger.info).not.toHaveBeenCalled();
  });
});
