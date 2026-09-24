import {
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { PinoLogger } from "nestjs-pino";
import { S3Service } from "src/sdk/aws/s3/s3.service";
import { ImageSlot, ImageUploadService, ImageUploadTarget } from "./image-upload.service";
import {
  buildImageS3Key,
  IMAGE_DOWNLOAD_URL_TTL_SECONDS,
  IMAGE_UPLOAD_CONFIRM_WINDOW_SECONDS,
  IMAGE_UPLOAD_ERROR_CODES,
  IMAGE_UPLOAD_ERRORS,
  IMAGE_UPLOAD_URL_TTL_SECONDS,
  MAX_IMAGE_SIZE_BYTES,
} from "./images.constants";

describe("ImageUploadService", () => {
  let service: ImageUploadService;
  let s3Service: {
    getPresignedUploadUrl: jest.Mock;
    getPresignedDownloadUrl: jest.Mock;
    headObject: jest.Mock;
    deleteObject: jest.Mock;
  };
  let logger: { setContext: jest.Mock; info: jest.Mock; warn: jest.Mock; error: jest.Mock };

  const ownerId = "11111111-1111-1111-1111-111111111111";
  const uploadId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  const previousUploadId = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
  const target: ImageUploadTarget = { prefix: "things/", ownerId };
  const key = buildImageS3Key(target.prefix, ownerId, uploadId);
  const previousKey = buildImageS3Key(target.prefix, ownerId, previousUploadId);
  const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

  const slotWith = (currentKey: string | null): ImageSlot & { save: jest.Mock } => ({
    currentKey,
    save: jest.fn().mockResolvedValue(undefined),
  });

  const uploadedObject = (overrides: Record<string, unknown> = {}) => ({
    exists: true,
    contentType: "image/jpeg",
    sizeBytes: 2048,
    lastModified: new Date(),
    ...overrides,
  });

  beforeEach(async () => {
    s3Service = {
      getPresignedUploadUrl: jest.fn().mockResolvedValue("https://s3.example/put?sig=1"),
      getPresignedDownloadUrl: jest.fn().mockResolvedValue("https://s3.example/get?sig=1"),
      headObject: jest.fn().mockResolvedValue(uploadedObject()),
      deleteObject: jest.fn().mockResolvedValue(undefined),
    };
    logger = { setContext: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ImageUploadService,
        { provide: S3Service, useValue: s3Service },
        { provide: PinoLogger, useValue: logger },
      ],
    }).compile();

    service = module.get(ImageUploadService);
  });

  describe("createUpload", () => {
    it("mints a PUT URL for {prefix}{ownerId}/{uploadId}, bound to the declared type and size", async () => {
      const result = await service.createUpload(target, { contentType: "image/png", sizeBytes: 4096 });

      expect(result.uploadId).toMatch(UUID_PATTERN);
      expect(result.uploadUrl).toBe("https://s3.example/put?sig=1");
      expect(s3Service.getPresignedUploadUrl).toHaveBeenCalledWith({
        key: buildImageS3Key(target.prefix, ownerId, result.uploadId),
        contentType: "image/png",
        contentLength: 4096,
        expiresInSeconds: IMAGE_UPLOAD_URL_TTL_SECONDS,
      });
    });

    it("returns when the URL stops being accepted, computed before signing", async () => {
      jest.useFakeTimers({ now: new Date("2026-09-23T12:00:00.000Z") });
      try {
        const result = await service.createUpload(target, { contentType: "image/png", sizeBytes: 4096 });

        expect(result.expiresAt).toEqual(new Date(Date.now() + IMAGE_UPLOAD_URL_TTL_SECONDS * 1000));
      } finally {
        jest.useRealTimers();
      }
    });

    it("carries a stable code on a rejected content type", async () => {
      const failure = await service
        .createUpload(target, { contentType: "image/gif", sizeBytes: 1024 })
        .catch((e: unknown) => e);

      expect(failure).toBeInstanceOf(BadRequestException);
      expect((failure as BadRequestException).getResponse()).toEqual({
        code: IMAGE_UPLOAD_ERROR_CODES.UNSUPPORTED_CONTENT_TYPE,
        message: IMAGE_UPLOAD_ERRORS.UNSUPPORTED_CONTENT_TYPE("image/gif"),
      });
    });

    it("mints a different upload id every time", async () => {
      const first = await service.createUpload(target, { contentType: "image/png", sizeBytes: 1 });
      const second = await service.createUpload(target, { contentType: "image/png", sizeBytes: 1 });

      expect(first.uploadId).not.toBe(second.uploadId);
    });

    it.each(["image/heic", "image/gif", "application/pdf", ""])("rejects the content type %p", async (contentType) => {
      await expect(service.createUpload(target, { contentType, sizeBytes: 1024 })).rejects.toThrow(
        new BadRequestException(IMAGE_UPLOAD_ERRORS.UNSUPPORTED_CONTENT_TYPE(contentType)),
      );
      expect(s3Service.getPresignedUploadUrl).not.toHaveBeenCalled();
    });

    it.each([0, -1, 1.5, MAX_IMAGE_SIZE_BYTES + 1])("rejects the size %p", async (sizeBytes) => {
      await expect(service.createUpload(target, { contentType: "image/jpeg", sizeBytes })).rejects.toThrow(
        new BadRequestException(IMAGE_UPLOAD_ERRORS.INVALID_SIZE(sizeBytes)),
      );
      expect(s3Service.getPresignedUploadUrl).not.toHaveBeenCalled();
    });

    it("accepts an image of exactly the maximum size", async () => {
      await expect(
        service.createUpload(target, { contentType: "image/webp", sizeBytes: MAX_IMAGE_SIZE_BYTES }),
      ).resolves.toEqual(expect.objectContaining({ uploadUrl: expect.any(String) as string }));
    });
  });

  describe("confirmUpload", () => {
    it("verifies the object at the server-derived key and saves it on an empty slot", async () => {
      const slot = slotWith(null);

      await expect(service.confirmUpload(target, uploadId, slot)).resolves.toBe(key);

      expect(s3Service.headObject).toHaveBeenCalledWith(key);
      expect(slot.save).toHaveBeenCalledWith(key);
      expect(s3Service.deleteObject).not.toHaveBeenCalled();
    });

    it("deletes the previous object before writing the row when replacing", async () => {
      const slot = slotWith(previousKey);
      const calls: string[] = [];
      s3Service.deleteObject.mockImplementation((deleted: string) => {
        calls.push(`delete:${deleted}`);
        return Promise.resolve();
      });
      slot.save.mockImplementation((saved: string) => {
        calls.push(`save:${saved}`);
        return Promise.resolve();
      });

      await service.confirmUpload(target, uploadId, slot);

      expect(calls).toEqual([`delete:${previousKey}`, `save:${key}`]);
    });

    it("keeps the row on the previous image when its object cannot be deleted, so the confirm can be retried", async () => {
      const slot = slotWith(previousKey);
      s3Service.deleteObject.mockRejectedValue(new InternalServerErrorException("s3 down"));

      await expect(service.confirmUpload(target, uploadId, slot)).rejects.toThrow(InternalServerErrorException);

      expect(slot.save).not.toHaveBeenCalled();
    });

    it("is a no-op for the upload the slot already references, however old its object", async () => {
      const slot = slotWith(key);

      await expect(service.confirmUpload(target, uploadId, slot)).resolves.toBe(key);

      expect(s3Service.headObject).not.toHaveBeenCalled();
      expect(s3Service.deleteObject).not.toHaveBeenCalled();
      expect(slot.save).not.toHaveBeenCalled();
    });

    it("reports a missing object as 404 and leaves the slot alone", async () => {
      const slot = slotWith(previousKey);
      s3Service.headObject.mockResolvedValue({ exists: false });

      await expect(service.confirmUpload(target, uploadId, slot)).rejects.toThrow(
        new NotFoundException(IMAGE_UPLOAD_ERRORS.UPLOAD_NOT_FOUND(uploadId)),
      );

      expect(s3Service.deleteObject).not.toHaveBeenCalled();
      expect(slot.save).not.toHaveBeenCalled();
    });

    it.each([
      ["a disallowed content type", { contentType: "image/gif" }],
      ["a missing content type", { contentType: undefined }],
      ["an oversize object", { sizeBytes: MAX_IMAGE_SIZE_BYTES + 1 }],
      ["an empty object", { sizeBytes: 0 }],
      ["an object of unknown size", { sizeBytes: undefined }],
    ])("discards %s and keeps the previous image", async (_label, overrides) => {
      const slot = slotWith(previousKey);
      s3Service.headObject.mockResolvedValue(uploadedObject(overrides));

      await expect(service.confirmUpload(target, uploadId, slot)).rejects.toThrow(
        new UnprocessableEntityException(IMAGE_UPLOAD_ERRORS.UPLOAD_REJECTED(uploadId)),
      );

      expect(s3Service.deleteObject).toHaveBeenCalledTimes(1);
      expect(s3Service.deleteObject).toHaveBeenCalledWith(key);
      expect(slot.save).not.toHaveBeenCalled();
    });

    it.each([
      ["older than the confirm window", new Date(Date.now() - (IMAGE_UPLOAD_CONFIRM_WINDOW_SECONDS + 60) * 1000)],
      ["without a timestamp", undefined],
    ])("discards an object %s, which the orphan reconciler may already be deleting", async (_label, lastModified) => {
      const slot = slotWith(null);
      s3Service.headObject.mockResolvedValue(uploadedObject({ lastModified }));

      await expect(service.confirmUpload(target, uploadId, slot)).rejects.toThrow(
        new UnprocessableEntityException(IMAGE_UPLOAD_ERRORS.UPLOAD_EXPIRED(uploadId)),
      );

      expect(s3Service.deleteObject).toHaveBeenCalledWith(key);
      expect(slot.save).not.toHaveBeenCalled();
    });

    it("still rejects when the discarded object cannot be deleted, and leaves it to the reconciler", async () => {
      s3Service.headObject.mockResolvedValue(uploadedObject({ contentType: "image/gif" }));
      s3Service.deleteObject.mockRejectedValue(new InternalServerErrorException("s3 down"));

      await expect(service.confirmUpload(target, uploadId, slotWith(null))).rejects.toThrow(
        UnprocessableEntityException,
      );

      expect(logger.warn).toHaveBeenCalledWith(
        { event: "image.upload_rejected.object_retained", uploadId },
        expect.any(String),
      );
    });

    it("propagates a failed row write after the previous object is gone; a retry repairs it", async () => {
      const slot = slotWith(previousKey);
      slot.save.mockRejectedValueOnce(new Error("db down"));

      await expect(service.confirmUpload(target, uploadId, slot)).rejects.toThrow("db down");
      // The retry reads the same row: deleting the already deleted key is a
      // no-op in S3, and this time the row is written.
      await expect(service.confirmUpload(target, uploadId, slot)).resolves.toBe(key);

      expect(slot.save).toHaveBeenLastCalledWith(key);
    });
  });

  describe("remove", () => {
    it("deletes the object, then clears the row", async () => {
      const slot = slotWith(previousKey);
      const calls: string[] = [];
      s3Service.deleteObject.mockImplementation(() => {
        calls.push("delete");
        return Promise.resolve();
      });
      slot.save.mockImplementation(() => {
        calls.push("save");
        return Promise.resolve();
      });

      await expect(service.remove(slot)).resolves.toBe(true);

      expect(calls).toEqual(["delete", "save"]);
      expect(s3Service.deleteObject).toHaveBeenCalledWith(previousKey);
      expect(slot.save).toHaveBeenCalledWith(null);
    });

    it("keeps the row when the object cannot be deleted, so the removal can be retried", async () => {
      const slot = slotWith(previousKey);
      s3Service.deleteObject.mockRejectedValue(new InternalServerErrorException("s3 down"));

      await expect(service.remove(slot)).rejects.toThrow(InternalServerErrorException);

      expect(slot.save).not.toHaveBeenCalled();
    });

    it("does nothing for an empty slot", async () => {
      const slot = slotWith(null);

      await expect(service.remove(slot)).resolves.toBe(false);

      expect(s3Service.deleteObject).not.toHaveBeenCalled();
      expect(slot.save).not.toHaveBeenCalled();
    });
  });

  describe("getDownloadUrl", () => {
    it("presigns a short-lived GET URL for a key", async () => {
      await expect(service.getDownloadUrl(key)).resolves.toBe("https://s3.example/get?sig=1");

      expect(s3Service.getPresignedDownloadUrl).toHaveBeenCalledWith({
        key,
        expiresInSeconds: IMAGE_DOWNLOAD_URL_TTL_SECONDS,
      });
    });

    it.each([null, undefined])("returns null for %p without touching S3", async (unset) => {
      await expect(service.getDownloadUrl(unset)).resolves.toBeNull();

      expect(s3Service.getPresignedDownloadUrl).not.toHaveBeenCalled();
    });
  });
});
