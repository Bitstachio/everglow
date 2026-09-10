import { BadRequestException, ForbiddenException, GoneException, NotFoundException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { Event, EventAccess, Photo, PrismaClient } from "generated/prisma/client";
import { DeepMockProxy, mockDeep } from "jest-mock-extended";
import { PinoLogger } from "nestjs-pino";
import { AbilityFactory } from "src/casl/ability.factory";
import { PrismaService } from "src/prisma/prisma.service";
import { S3Service } from "src/sdk/aws/s3/s3.service";
import { UserWithDetails } from "src/users/users.types";
import { PhotoMultipartService } from "./photo-multipart.service";
import { PhotoStorageService } from "./photo-storage.service";
import {
  buildPhotoS3Key,
  FREE_TIER_STORAGE_LIMIT_BYTES,
  MULTIPART_PART_SIZE_BYTES,
  PHOTO_SERVICE_ERRORS,
  UPLOAD_URL_TTL_SECONDS,
} from "./photos.constants";
import { PhotosService } from "./photos.service";

describe("PhotoMultipartService", () => {
  const MIB = 1024 * 1024;
  let service: PhotoMultipartService;
  let prisma: DeepMockProxy<PrismaClient>;
  let s3Service: {
    createMultipartUpload: jest.Mock;
    getPresignedUploadPartUrl: jest.Mock;
    listMultipartParts: jest.Mock;
    completeMultipartUpload: jest.Mock;
  };
  let photoStorageService: { reserveUploadBytes: jest.Mock };
  let photosService: { assertCanUploadToEvent: jest.Mock; releaseUploadSlots: jest.Mock; verifyUploads: jest.Mock };
  let logger: { setContext: jest.Mock; info: jest.Mock; warn: jest.Mock; error: jest.Mock; debug: jest.Mock };

  const callerId = "11111111-1111-1111-1111-111111111111";
  const otherUserId = "22222222-2222-2222-2222-222222222222";
  const eventId = "66666666-6666-6666-6666-666666666666";
  const photoId = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
  const uploadId = "upload-1";
  const now = new Date("2026-06-10T12:00:00.000Z");
  const s3Key = buildPhotoS3Key(callerId, eventId, photoId);

  const caller: UserWithDetails = {
    id: callerId,
    providerSub: "auth0|caller",
    storageLimitBytes: FREE_TIER_STORAGE_LIMIT_BYTES,
    createdAt: now,
    updatedAt: now,
    details: {
      id: "33333333-3333-3333-3333-333333333333",
      userId: callerId,
      email: "c@example.com",
      name: "Caller",
      createdAt: now,
      updatedAt: now,
    },
  };

  const event: Event = {
    id: eventId,
    title: "Summer BBQ",
    description: null,
    date: now,
    creatorId: callerId,
    invitationUrl: "invite",
    createdAt: now,
    updatedAt: now,
  };

  const access = (accessLevel: EventAccess["accessLevel"], userId = callerId): EventAccess => ({
    id: "44444444-4444-4444-4444-444444444444",
    userId,
    eventId,
    accessLevel,
    createdAt: now,
    updatedAt: now,
  });

  /** The 12 MiB upload every test uses: parts of 5, 5 and 2 MiB. */
  const upload = (overrides: Partial<Photo> = {}): Photo => ({
    id: photoId,
    eventId,
    addedById: callerId,
    s3Key,
    contentType: "image/jpeg",
    sizeBytes: 12 * MIB,
    status: "PENDING",
    multipartUploadId: uploadId,
    multipartPartSizeBytes: MULTIPART_PART_SIZE_BYTES,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });

  const loaded = (photo: Photo, accesses: EventAccess[] = [access("PARTICIPANT")]) =>
    ({ ...photo, event: { ...event, eventAccesses: accesses } }) as never;

  const listed = (...parts: { partNumber: number; sizeBytes: number; etag?: string }[]) => ({
    exists: true,
    parts: parts.map((part) => ({ etag: `"etag-${part.partNumber}"`, ...part })),
  });

  beforeEach(async () => {
    prisma = mockDeep<PrismaClient>();
    prisma.user.findUnique.mockResolvedValue(caller);
    s3Service = {
      createMultipartUpload: jest.fn().mockResolvedValue(uploadId),
      getPresignedUploadPartUrl: jest
        .fn()
        .mockImplementation(({ partNumber }: { partNumber: number }) =>
          Promise.resolve(`https://signed-part-${partNumber}`),
        ),
      listMultipartParts: jest.fn().mockResolvedValue({ exists: true, parts: [] }),
      completeMultipartUpload: jest.fn().mockResolvedValue({ completed: true }),
    };
    photoStorageService = { reserveUploadBytes: jest.fn().mockResolvedValue(undefined) };
    photosService = {
      assertCanUploadToEvent: jest.fn().mockResolvedValue(undefined),
      releaseUploadSlots: jest.fn().mockResolvedValue(1),
      verifyUploads: jest.fn().mockResolvedValue([{ photoId, status: "READY" }]),
    };
    logger = { setContext: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PhotoMultipartService,
        AbilityFactory,
        { provide: PrismaService, useValue: prisma },
        { provide: S3Service, useValue: s3Service },
        { provide: PhotoStorageService, useValue: photoStorageService },
        { provide: PhotosService, useValue: photosService },
        { provide: PinoLogger, useValue: logger },
      ],
    }).compile();

    service = module.get(PhotoMultipartService);
  });

  describe("initiate", () => {
    const file = { contentType: "image/jpeg", sizeBytes: 12 * MIB };

    it("checks the caller may upload to the event before doing anything", async () => {
      photosService.assertCanUploadToEvent.mockRejectedValue(new ForbiddenException("nope"));

      await expect(service.initiate(eventId, callerId, file)).rejects.toBeInstanceOf(ForbiddenException);

      expect(photosService.assertCanUploadToEvent).toHaveBeenCalledWith(
        eventId,
        callerId,
        PHOTO_SERVICE_ERRORS.CREATE_FORBIDDEN,
      );
      expect(photoStorageService.reserveUploadBytes).not.toHaveBeenCalled();
      expect(s3Service.createMultipartUpload).not.toHaveBeenCalled();
    });

    it("reserves the slot, opens the upload, records the id, and returns the part layout", async () => {
      const state = await service.initiate(eventId, callerId, file);

      const [reservedFor, rows] = photoStorageService.reserveUploadBytes.mock.calls[0] as [
        string,
        Record<string, unknown>[],
      ];
      expect(reservedFor).toBe(callerId);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        eventId,
        addedById: callerId,
        contentType: "image/jpeg",
        sizeBytes: 12 * MIB,
        status: "PENDING",
        multipartPartSizeBytes: MULTIPART_PART_SIZE_BYTES,
      });
      const newId = rows[0].id as string;
      const key = buildPhotoS3Key(callerId, eventId, newId);

      // Reservation commits first, then S3, then the row learns the upload id.
      expect(s3Service.createMultipartUpload).toHaveBeenCalledWith({ key, contentType: "image/jpeg" });
      expect(photoStorageService.reserveUploadBytes.mock.invocationCallOrder[0]).toBeLessThan(
        s3Service.createMultipartUpload.mock.invocationCallOrder[0],
      );
      expect(prisma.photo.update).toHaveBeenCalledWith({
        where: { id: newId },
        data: { multipartUploadId: uploadId },
      });

      expect(state.photoId).toBe(newId);
      expect(state.sizeBytes).toBe(12 * MIB);
      expect(state.partSizeBytes).toBe(MULTIPART_PART_SIZE_BYTES);
      expect(state.expiresAt.getTime()).toBeGreaterThan(Date.now() + (UPLOAD_URL_TTL_SECONDS - 60) * 1000);
      expect(state.parts).toEqual([
        { partNumber: 1, sizeBytes: 5 * MIB, uploadUrl: "https://signed-part-1", uploaded: false },
        { partNumber: 2, sizeBytes: 5 * MIB, uploadUrl: "https://signed-part-2", uploaded: false },
        { partNumber: 3, sizeBytes: 2 * MIB, uploadUrl: "https://signed-part-3", uploaded: false },
      ]);
      expect(s3Service.getPresignedUploadPartUrl).toHaveBeenCalledWith({
        key,
        uploadId,
        partNumber: 3,
        contentLength: 2 * MIB,
        expiresInSeconds: UPLOAD_URL_TTL_SECONDS,
      });
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({ event: "photo.multipart.initiated", photoId: newId, partCount: 3 }),
        expect.any(String),
      );
    });

    it("releases the reserved row and rethrows when S3 refuses to open the upload", async () => {
      const s3Error = new Error("s3 down");
      s3Service.createMultipartUpload.mockRejectedValue(s3Error);

      await expect(service.initiate(eventId, callerId, file)).rejects.toBe(s3Error);

      const [, rows] = photoStorageService.reserveUploadBytes.mock.calls[0] as [
        string,
        { id: string; s3Key: string }[],
      ];
      expect(photosService.releaseUploadSlots).toHaveBeenCalledWith(
        [{ id: rows[0].id, s3Key: rows[0].s3Key, multipartUploadId: null }],
        expect.objectContaining({ event: "photo.multipart.create_failed", eventId, callerId }),
      );
      expect(prisma.photo.update).not.toHaveBeenCalled();
    });

    it("aborts the upload and releases the row when the upload id cannot be recorded", async () => {
      const dbError = new Error("db down");
      prisma.photo.update.mockRejectedValue(dbError);

      await expect(service.initiate(eventId, callerId, file)).rejects.toBe(dbError);

      expect(photosService.releaseUploadSlots).toHaveBeenCalledWith(
        [expect.objectContaining({ multipartUploadId: uploadId })],
        expect.objectContaining({ event: "photo.multipart.initiate_failed", eventId, callerId }),
      );
    });

    it("aborts the upload and releases the row when part URLs cannot be signed", async () => {
      s3Service.getPresignedUploadPartUrl.mockRejectedValue(new Error("presign down"));

      await expect(service.initiate(eventId, callerId, file)).rejects.toThrow("presign down");

      expect(photosService.releaseUploadSlots).toHaveBeenCalledWith(
        [expect.objectContaining({ multipartUploadId: uploadId })],
        expect.objectContaining({ event: "photo.multipart.initiate_failed" }),
      );
    });
  });

  describe("getState", () => {
    it("throws NotFoundException when the photo does not exist", async () => {
      prisma.photo.findUnique.mockResolvedValue(null);

      await expect(service.getState(photoId, callerId)).rejects.toBeInstanceOf(NotFoundException);
    });

    it("throws NotFoundException for another uploader's slot", async () => {
      prisma.photo.findUnique.mockResolvedValue(loaded(upload({ addedById: otherUserId }), [access("ORGANIZER")]));

      await expect(service.getState(photoId, callerId)).rejects.toBeInstanceOf(NotFoundException);
      expect(s3Service.listMultipartParts).not.toHaveBeenCalled();
    });

    it("throws ForbiddenException when the uploader has lost event access", async () => {
      prisma.photo.findUnique.mockResolvedValue(loaded(upload(), []));

      await expect(service.getState(photoId, callerId)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it.each([
      ["a single-PUT slot", { multipartUploadId: null, multipartPartSizeBytes: null }],
      ["a READY photo", { status: "READY" as const, multipartUploadId: null, multipartPartSizeBytes: null }],
    ])("throws NotFoundException for %s", async (_label, overrides) => {
      prisma.photo.findUnique.mockResolvedValue(loaded(upload(overrides)));

      await expect(service.getState(photoId, callerId)).rejects.toThrow(
        PHOTO_SERVICE_ERRORS.MULTIPART_NOT_FOUND(photoId),
      );
    });

    it("marks only the parts S3 holds at their full size as uploaded, with fresh URLs for all", async () => {
      prisma.photo.findUnique.mockResolvedValue(loaded(upload()));
      // Part 2 is only half there: it must be re-sent.
      s3Service.listMultipartParts.mockResolvedValue(
        listed({ partNumber: 1, sizeBytes: 5 * MIB }, { partNumber: 2, sizeBytes: 3 * MIB }),
      );

      const state = await service.getState(photoId, callerId);

      expect(s3Service.listMultipartParts).toHaveBeenCalledWith({ key: s3Key, uploadId });
      expect(state.parts.map((part) => [part.partNumber, part.uploaded])).toEqual([
        [1, true],
        [2, false],
        [3, false],
      ]);
      expect(state.parts.map((part) => part.uploadUrl)).toEqual([
        "https://signed-part-1",
        "https://signed-part-2",
        "https://signed-part-3",
      ]);
    });

    it("releases the slot and throws GoneException when S3 no longer knows the upload", async () => {
      prisma.photo.findUnique.mockResolvedValue(loaded(upload()));
      s3Service.listMultipartParts.mockResolvedValue({ exists: false });

      await expect(service.getState(photoId, callerId)).rejects.toBeInstanceOf(GoneException);

      // Nothing left to abort on S3's side, so the release carries no upload id.
      expect(photosService.releaseUploadSlots).toHaveBeenCalledWith(
        [{ id: photoId, s3Key, multipartUploadId: null }],
        expect.objectContaining({ event: "photo.multipart.expired", eventId, callerId }),
      );
    });
  });

  describe("complete", () => {
    const allParts = () =>
      listed(
        { partNumber: 1, sizeBytes: 5 * MIB },
        { partNumber: 2, sizeBytes: 5 * MIB },
        { partNumber: 3, sizeBytes: 2 * MIB },
      );

    it("returns READY without touching S3 when the photo is already READY", async () => {
      prisma.photo.findUnique.mockResolvedValue(loaded(upload({ status: "READY", multipartUploadId: null })));

      await expect(service.complete(photoId, callerId)).resolves.toEqual({ photoId, status: "READY" });

      expect(s3Service.listMultipartParts).not.toHaveBeenCalled();
      expect(photosService.verifyUploads).not.toHaveBeenCalled();
    });

    it("rejects with 400 naming the parts that are missing or the wrong size", async () => {
      prisma.photo.findUnique.mockResolvedValue(loaded(upload()));
      s3Service.listMultipartParts.mockResolvedValue(
        listed({ partNumber: 1, sizeBytes: 5 * MIB }, { partNumber: 3, sizeBytes: 1 * MIB }),
      );

      await expect(service.complete(photoId, callerId)).rejects.toThrow(
        PHOTO_SERVICE_ERRORS.MULTIPART_INCOMPLETE([2, 3]),
      );

      expect(s3Service.completeMultipartUpload).not.toHaveBeenCalled();
      expect(photosService.releaseUploadSlots).not.toHaveBeenCalled();
    });

    it("treats a part without an ETag as not uploaded", async () => {
      prisma.photo.findUnique.mockResolvedValue(loaded(upload()));
      s3Service.listMultipartParts.mockResolvedValue({
        exists: true,
        parts: [
          { partNumber: 1, sizeBytes: 5 * MIB, etag: '"a"' },
          { partNumber: 2, sizeBytes: 5 * MIB },
          { partNumber: 3, sizeBytes: 2 * MIB, etag: '"c"' },
        ],
      });

      await expect(service.complete(photoId, callerId)).rejects.toThrow(PHOTO_SERVICE_ERRORS.MULTIPART_INCOMPLETE([2]));
    });

    it("assembles the parts in order with the ETags S3 reported, then verifies the object", async () => {
      prisma.photo.findUnique.mockResolvedValue(loaded(upload()));
      s3Service.listMultipartParts.mockResolvedValue(allParts());

      await expect(service.complete(photoId, callerId)).resolves.toEqual({ photoId, status: "READY" });

      expect(s3Service.completeMultipartUpload).toHaveBeenCalledWith({
        key: s3Key,
        uploadId,
        parts: [
          { partNumber: 1, etag: '"etag-1"' },
          { partNumber: 2, etag: '"etag-2"' },
          { partNumber: 3, etag: '"etag-3"' },
        ],
      });
      expect(photosService.verifyUploads).toHaveBeenCalledWith([expect.objectContaining({ id: photoId })], {
        eventId,
        callerId,
      });
      expect(s3Service.completeMultipartUpload.mock.invocationCallOrder[0]).toBeLessThan(
        photosService.verifyUploads.mock.invocationCallOrder[0],
      );
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({ event: "photo.multipart.completed", photoId, status: "READY" }),
        expect.any(String),
      );
    });

    it("passes the verification verdict through when the assembled object does not match", async () => {
      prisma.photo.findUnique.mockResolvedValue(loaded(upload()));
      s3Service.listMultipartParts.mockResolvedValue(allParts());
      photosService.verifyUploads.mockResolvedValue([{ photoId, status: "MISMATCHED" }]);

      await expect(service.complete(photoId, callerId)).resolves.toEqual({ photoId, status: "MISMATCHED" });
    });

    it("releases the slot and throws GoneException when S3 lost the upload before assembly", async () => {
      prisma.photo.findUnique.mockResolvedValue(loaded(upload()));
      s3Service.listMultipartParts.mockResolvedValue(allParts());
      s3Service.completeMultipartUpload.mockResolvedValue({ completed: false, code: "NoSuchUpload" });

      await expect(service.complete(photoId, callerId)).rejects.toBeInstanceOf(GoneException);

      expect(photosService.releaseUploadSlots).toHaveBeenCalledWith(
        [{ id: photoId, s3Key, multipartUploadId: null }],
        expect.objectContaining({ event: "photo.multipart.expired" }),
      );
      expect(photosService.verifyUploads).not.toHaveBeenCalled();
    });

    it("rejects with 400 and keeps the upload open when S3 refuses the assembly", async () => {
      prisma.photo.findUnique.mockResolvedValue(loaded(upload()));
      s3Service.listMultipartParts.mockResolvedValue(allParts());
      s3Service.completeMultipartUpload.mockResolvedValue({ completed: false, code: "InvalidPart" });

      await expect(service.complete(photoId, callerId)).rejects.toBeInstanceOf(BadRequestException);
      await expect(service.complete(photoId, callerId)).rejects.toThrow(
        PHOTO_SERVICE_ERRORS.MULTIPART_COMPLETE_REJECTED("InvalidPart"),
      );

      expect(photosService.releaseUploadSlots).not.toHaveBeenCalled();
    });

    it("throws NotFoundException for another uploader's slot", async () => {
      prisma.photo.findUnique.mockResolvedValue(loaded(upload({ addedById: otherUserId }), [access("ORGANIZER")]));

      await expect(service.complete(photoId, callerId)).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
