import {
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { Event, PrismaClient } from "generated/prisma/client";
import { DeepMockProxy, mockDeep } from "jest-mock-extended";
import { PinoLogger } from "nestjs-pino";
import { ImageUploadService } from "src/images/image-upload.service";
import {
  buildImageS3Key,
  IMAGE_UPLOAD_CONFIRM_WINDOW_SECONDS,
  IMAGE_UPLOAD_ERRORS,
  MAX_IMAGE_SIZE_BYTES,
} from "src/images/images.constants";
import { PrismaService } from "src/prisma/prisma.service";
import { S3Service } from "src/sdk/aws/s3/s3.service";
import { EventCoverService } from "./event-cover.service";
import { EVENT_COVER_S3_KEY_PREFIX, EVENT_SERVICE_ERRORS } from "./events.constants";
import { EventsService } from "./events.service";

// The real ImageUploadService runs against a stubbed S3Service: what matters
// here is the cover flow end to end (authorization first, key derivation,
// verification, ordering, the conditional row write). Who may update an event
// is EventsService.getUpdatable's business and is covered with it.
describe("EventCoverService", () => {
  let service: EventCoverService;
  let prisma: DeepMockProxy<PrismaClient>;
  let eventsService: { getUpdatable: jest.Mock; findOne: jest.Mock };
  let s3Service: {
    getPresignedUploadUrl: jest.Mock;
    getPresignedDownloadUrl: jest.Mock;
    headObject: jest.Mock;
    deleteObject: jest.Mock;
  };
  let logger: { setContext: jest.Mock; info: jest.Mock; warn: jest.Mock; error: jest.Mock };

  const eventId = "66666666-6666-6666-6666-666666666666";
  const callerId = "11111111-1111-1111-1111-111111111111";
  const uploadId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  const previousUploadId = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
  const coverKey = buildImageS3Key(EVENT_COVER_S3_KEY_PREFIX, eventId, uploadId);
  const previousCoverKey = buildImageS3Key(EVENT_COVER_S3_KEY_PREFIX, eventId, previousUploadId);
  const now = new Date("2026-06-10T12:00:00.000Z");

  const eventWithCover = (coverS3Key: string | null): Event => ({
    id: eventId,
    title: "Summer BBQ",
    description: null,
    date: new Date("2026-09-15T18:00:00.000Z"),
    creatorId: callerId,
    invitationUrl: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    coverS3Key,
    createdAt: now,
    updatedAt: now,
  });

  const uploadedObject = (overrides: Record<string, unknown> = {}) => ({
    exists: true,
    contentType: "image/jpeg",
    sizeBytes: 2048,
    lastModified: new Date(),
    ...overrides,
  });

  const notAnOrganizer = new ForbiddenException(EVENT_SERVICE_ERRORS.UPDATE_FORBIDDEN(eventId));

  beforeEach(async () => {
    prisma = mockDeep<PrismaClient>();
    prisma.event.updateMany.mockResolvedValue({ count: 1 });
    eventsService = {
      getUpdatable: jest.fn().mockResolvedValue(eventWithCover(null)),
      findOne: jest.fn().mockResolvedValue(eventWithCover(coverKey)),
    };
    s3Service = {
      getPresignedUploadUrl: jest.fn().mockResolvedValue("https://s3.example/put?sig=1"),
      getPresignedDownloadUrl: jest.fn().mockResolvedValue("https://s3.example/get?sig=1"),
      headObject: jest.fn().mockResolvedValue(uploadedObject()),
      deleteObject: jest.fn().mockResolvedValue(undefined),
    };
    logger = { setContext: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventCoverService,
        ImageUploadService,
        { provide: PrismaService, useValue: prisma },
        { provide: EventsService, useValue: eventsService },
        { provide: S3Service, useValue: s3Service },
        { provide: PinoLogger, useValue: logger },
      ],
    }).compile();

    service = module.get(EventCoverService);
  });

  describe("createUpload", () => {
    it("mints an upload under event-covers/{eventId}/ for a caller who may update the event", async () => {
      const result = await service.createUpload(eventId, callerId, { contentType: "image/jpeg", sizeBytes: 2048 });

      expect(eventsService.getUpdatable).toHaveBeenCalledWith(eventId, callerId);
      expect(result.uploadUrl).toBe("https://s3.example/put?sig=1");
      expect(s3Service.getPresignedUploadUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          key: buildImageS3Key(EVENT_COVER_S3_KEY_PREFIX, eventId, result.uploadId),
          contentType: "image/jpeg",
          contentLength: 2048,
        }),
      );
    });

    it("refuses a caller who may not update the event without minting anything", async () => {
      eventsService.getUpdatable.mockRejectedValue(notAnOrganizer);

      await expect(
        service.createUpload(eventId, callerId, { contentType: "image/jpeg", sizeBytes: 2048 }),
      ).rejects.toThrow(notAnOrganizer);

      expect(s3Service.getPresignedUploadUrl).not.toHaveBeenCalled();
    });

    it("writes nothing to the database: uploads are stateless", async () => {
      await service.createUpload(eventId, callerId, { contentType: "image/jpeg", sizeBytes: 2048 });

      expect(prisma.event.updateMany).not.toHaveBeenCalled();
      expect(logger.info).not.toHaveBeenCalled();
    });
  });

  describe("confirmUpload", () => {
    it("verifies the event's own key, sets it, and returns the refreshed event", async () => {
      const result = await service.confirmUpload(eventId, callerId, uploadId);

      expect(s3Service.headObject).toHaveBeenCalledWith(coverKey);
      expect(prisma.event.updateMany).toHaveBeenCalledWith({
        where: { id: eventId, coverS3Key: null },
        data: { coverS3Key: coverKey },
      });
      expect(s3Service.deleteObject).not.toHaveBeenCalled();
      expect(eventsService.findOne).toHaveBeenCalledWith(eventId, callerId);
      expect(result).toEqual(eventWithCover(coverKey));
      expect(logger.info).toHaveBeenCalledWith(
        { event: "event.cover.set", eventId, callerId, uploadId, replaced: false, audit: true },
        "Event cover set",
      );
    });

    it("deletes the replaced cover's object before pointing the row at the new one", async () => {
      eventsService.getUpdatable.mockResolvedValue(eventWithCover(previousCoverKey));

      await service.confirmUpload(eventId, callerId, uploadId);

      expect(s3Service.deleteObject).toHaveBeenCalledTimes(1);
      expect(s3Service.deleteObject).toHaveBeenCalledWith(previousCoverKey);
      expect(prisma.event.updateMany).toHaveBeenCalledWith({
        where: { id: eventId, coverS3Key: previousCoverKey },
        data: { coverS3Key: coverKey },
      });
      expect(s3Service.deleteObject.mock.invocationCallOrder[0]).toBeLessThan(
        prisma.event.updateMany.mock.invocationCallOrder[0],
      );
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({ event: "event.cover.set", replaced: true, audit: true }),
        expect.any(String),
      );
    });

    it("keeps the current cover when its object cannot be deleted", async () => {
      eventsService.getUpdatable.mockResolvedValue(eventWithCover(previousCoverKey));
      s3Service.deleteObject.mockRejectedValue(new InternalServerErrorException("s3 down"));

      await expect(service.confirmUpload(eventId, callerId, uploadId)).rejects.toThrow(InternalServerErrorException);

      expect(prisma.event.updateMany).not.toHaveBeenCalled();
      expect(logger.info).not.toHaveBeenCalled();
    });

    it("is idempotent for the cover that is already set", async () => {
      const current = eventWithCover(coverKey);
      eventsService.getUpdatable.mockResolvedValue(current);

      await expect(service.confirmUpload(eventId, callerId, uploadId)).resolves.toBe(current);

      expect(s3Service.headObject).not.toHaveBeenCalled();
      expect(s3Service.deleteObject).not.toHaveBeenCalled();
      expect(prisma.event.updateMany).not.toHaveBeenCalled();
      expect(logger.info).not.toHaveBeenCalled();
    });

    it("reports 404 when nothing was uploaded", async () => {
      s3Service.headObject.mockResolvedValue({ exists: false });

      await expect(service.confirmUpload(eventId, callerId, uploadId)).rejects.toThrow(
        new NotFoundException(IMAGE_UPLOAD_ERRORS.UPLOAD_NOT_FOUND(uploadId)),
      );

      expect(prisma.event.updateMany).not.toHaveBeenCalled();
    });

    it.each([
      ["a disallowed content type", { contentType: "image/heic" }],
      ["an oversize object", { sizeBytes: MAX_IMAGE_SIZE_BYTES + 1 }],
    ])("discards %s and keeps the current cover", async (_label, overrides) => {
      eventsService.getUpdatable.mockResolvedValue(eventWithCover(previousCoverKey));
      s3Service.headObject.mockResolvedValue(uploadedObject(overrides));

      await expect(service.confirmUpload(eventId, callerId, uploadId)).rejects.toThrow(
        new UnprocessableEntityException(IMAGE_UPLOAD_ERRORS.UPLOAD_REJECTED(uploadId)),
      );

      expect(s3Service.deleteObject).toHaveBeenCalledTimes(1);
      expect(s3Service.deleteObject).toHaveBeenCalledWith(coverKey);
      expect(prisma.event.updateMany).not.toHaveBeenCalled();
    });

    it("rejects an upload left unconfirmed past the window", async () => {
      const lastModified = new Date(Date.now() - (IMAGE_UPLOAD_CONFIRM_WINDOW_SECONDS + 60) * 1000);
      s3Service.headObject.mockResolvedValue(uploadedObject({ lastModified }));

      await expect(service.confirmUpload(eventId, callerId, uploadId)).rejects.toThrow(
        new UnprocessableEntityException(IMAGE_UPLOAD_ERRORS.UPLOAD_EXPIRED(uploadId)),
      );

      expect(prisma.event.updateMany).not.toHaveBeenCalled();
    });

    it("tells the loser of two racing confirms to retry instead of orphaning the winner's object", async () => {
      prisma.event.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.confirmUpload(eventId, callerId, uploadId)).rejects.toThrow(
        new ConflictException(EVENT_SERVICE_ERRORS.COVER_CHANGED_CONCURRENTLY),
      );

      expect(logger.info).not.toHaveBeenCalled();
    });

    it("refuses a caller who may not update the event without touching S3", async () => {
      eventsService.getUpdatable.mockRejectedValue(notAnOrganizer);

      await expect(service.confirmUpload(eventId, callerId, uploadId)).rejects.toThrow(notAnOrganizer);

      expect(s3Service.headObject).not.toHaveBeenCalled();
    });
  });

  describe("remove", () => {
    it("deletes the object, then clears the column", async () => {
      eventsService.getUpdatable.mockResolvedValue(eventWithCover(coverKey));

      await service.remove(eventId, callerId);

      expect(s3Service.deleteObject).toHaveBeenCalledWith(coverKey);
      expect(prisma.event.updateMany).toHaveBeenCalledWith({
        where: { id: eventId, coverS3Key: coverKey },
        data: { coverS3Key: null },
      });
      expect(s3Service.deleteObject.mock.invocationCallOrder[0]).toBeLessThan(
        prisma.event.updateMany.mock.invocationCallOrder[0],
      );
      expect(logger.info).toHaveBeenCalledWith(
        { event: "event.cover.removed", eventId, callerId, audit: true },
        "Event cover removed",
      );
    });

    it("keeps the cover when its object cannot be deleted, so the removal can be retried", async () => {
      eventsService.getUpdatable.mockResolvedValue(eventWithCover(coverKey));
      s3Service.deleteObject.mockRejectedValue(new InternalServerErrorException("s3 down"));

      await expect(service.remove(eventId, callerId)).rejects.toThrow(InternalServerErrorException);

      expect(prisma.event.updateMany).not.toHaveBeenCalled();
      expect(logger.info).not.toHaveBeenCalled();
    });

    it("is a silent no-op when there is no cover", async () => {
      await service.remove(eventId, callerId);

      expect(s3Service.deleteObject).not.toHaveBeenCalled();
      expect(prisma.event.updateMany).not.toHaveBeenCalled();
      expect(logger.info).not.toHaveBeenCalled();
    });

    it("refuses a caller who may not update the event", async () => {
      eventsService.getUpdatable.mockRejectedValue(notAnOrganizer);

      await expect(service.remove(eventId, callerId)).rejects.toThrow(notAnOrganizer);

      expect(s3Service.deleteObject).not.toHaveBeenCalled();
    });
  });

  describe("getCoverUrl", () => {
    it("presigns the cover of an event that has one", async () => {
      await expect(service.getCoverUrl(eventWithCover(coverKey))).resolves.toBe("https://s3.example/get?sig=1");

      expect(s3Service.getPresignedDownloadUrl).toHaveBeenCalledWith(expect.objectContaining({ key: coverKey }));
    });

    it("returns null for an event without a cover, and touches neither S3 nor the database", async () => {
      await expect(service.getCoverUrl(eventWithCover(null))).resolves.toBeNull();

      expect(s3Service.getPresignedDownloadUrl).not.toHaveBeenCalled();
      expect(prisma.event.findUnique).not.toHaveBeenCalled();
    });
  });

  // Audit lines identify the event, the principal, and the upload; presigned
  // URLs carry a signature and must never reach the logs.
  it("never logs a URL or an S3 key", async () => {
    eventsService.getUpdatable.mockResolvedValue(eventWithCover(previousCoverKey));
    await service.confirmUpload(eventId, callerId, uploadId);
    eventsService.getUpdatable.mockResolvedValue(eventWithCover(coverKey));
    await service.remove(eventId, callerId);

    const logged = JSON.stringify(logger.info.mock.calls);
    expect(logged).not.toContain("https://");
    expect(logged).not.toContain(EVENT_COVER_S3_KEY_PREFIX);
  });
});
