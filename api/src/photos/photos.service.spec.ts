import { ConflictException, ForbiddenException, NotFoundException, PayloadTooLargeException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { Event, EventAccess, Photo, PrismaClient } from "generated/prisma/client";
import { DeepMockProxy, mockDeep } from "jest-mock-extended";
import { PinoLogger } from "nestjs-pino";
import { AbilityFactory } from "src/casl/ability.factory";
import { PrismaService } from "src/prisma/prisma.service";
import { S3Service } from "src/sdk/aws/s3/s3.service";
import { UserWithDetails } from "src/users/users.types";
import { UploadFileDto } from "./dto/create-upload-urls.dto";
import {
  buildPhotoS3Key,
  FREE_TIER_STORAGE_LIMIT_BYTES,
  PHOTO_SERVICE_ERRORS,
  UPLOAD_URL_TTL_SECONDS,
} from "./photos.constants";
import { PhotoStorageService } from "./photo-storage.service";
import { PhotosService } from "./photos.service";

describe("PhotosService", () => {
  let service: PhotosService;
  let prisma: DeepMockProxy<PrismaClient>;
  let s3Service: {
    getPresignedUploadUrl: jest.Mock;
    getPresignedDownloadUrl: jest.Mock;
    headObject: jest.Mock;
    deleteObject: jest.Mock;
  };
  let photoStorageService: { reserveUploadBytes: jest.Mock };

  const callerId = "11111111-1111-1111-1111-111111111111";
  const eventId = "66666666-6666-6666-6666-666666666666";
  const now = new Date("2026-06-10T12:00:00.000Z");

  const callerWithoutDetails: UserWithDetails = {
    id: callerId,
    providerSub: "auth0|caller",
    storageLimitBytes: FREE_TIER_STORAGE_LIMIT_BYTES,
    createdAt: now,
    updatedAt: now,
    details: null,
  };

  const callerWithDetails: UserWithDetails = {
    ...callerWithoutDetails,
    details: {
      id: "33333333-3333-3333-3333-333333333333",
      userId: callerId,
      email: "caller@example.com",
      name: "Caller",
      createdAt: now,
      updatedAt: now,
    },
  };

  const event: Event = {
    id: eventId,
    title: "Summer BBQ",
    description: null,
    date: new Date("2026-08-15T18:00:00.000Z"),
    creatorId: callerId,
    invitationUrl: "invite-token",
    createdAt: now,
    updatedAt: now,
  };

  const callerAccess = (accessLevel: EventAccess["accessLevel"]): EventAccess => ({
    id: "44444444-4444-4444-4444-444444444444",
    userId: callerId,
    eventId,
    accessLevel,
    createdAt: now,
    updatedAt: now,
  });

  const eventWithAccess = (access: EventAccess[]) => ({
    ...event,
    eventAccesses: access,
  });

  const files: UploadFileDto[] = [
    { contentType: "image/jpeg", sizeBytes: 1024 },
    { contentType: "image/png", sizeBytes: 2048 },
  ];

  const buildPhoto = (photoId: string, overrides: Partial<Photo> = {}): Photo => ({
    id: photoId,
    eventId,
    addedById: callerId,
    s3Key: buildPhotoS3Key(callerId, eventId, photoId),
    contentType: "image/jpeg",
    sizeBytes: 1024,
    status: "PENDING",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });

  beforeEach(async () => {
    prisma = mockDeep<PrismaClient>();
    s3Service = {
      getPresignedUploadUrl: jest.fn().mockResolvedValue("https://signed-put"),
      getPresignedDownloadUrl: jest.fn().mockResolvedValue("https://signed-get"),
      headObject: jest.fn(),
      deleteObject: jest.fn().mockResolvedValue(undefined),
    };
    photoStorageService = { reserveUploadBytes: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PhotosService,
        AbilityFactory,
        { provide: PrismaService, useValue: prisma },
        { provide: S3Service, useValue: s3Service },
        { provide: PhotoStorageService, useValue: photoStorageService },
        {
          provide: PinoLogger,
          useValue: { setContext: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
        },
      ],
    }).compile();

    service = module.get(PhotosService);
  });

  describe("createUploadSlots", () => {
    it("throws NotFoundException when the event does not exist", async () => {
      prisma.user.findUnique.mockResolvedValue(callerWithDetails);
      prisma.event.findUnique.mockResolvedValue(null);

      await expect(service.createUploadSlots(eventId, callerId, files)).rejects.toBeInstanceOf(NotFoundException);
      expect(photoStorageService.reserveUploadBytes).not.toHaveBeenCalled();
    });

    it("throws ForbiddenException when the caller is not a member of the event", async () => {
      prisma.user.findUnique.mockResolvedValue(callerWithDetails);
      prisma.event.findUnique.mockResolvedValue(eventWithAccess([]) as never);

      await expect(service.createUploadSlots(eventId, callerId, files)).rejects.toBeInstanceOf(ForbiddenException);
      expect(photoStorageService.reserveUploadBytes).not.toHaveBeenCalled();
    });

    it("throws ForbiddenException when the caller is a viewer", async () => {
      prisma.user.findUnique.mockResolvedValue(callerWithDetails);
      prisma.event.findUnique.mockResolvedValue(eventWithAccess([callerAccess("VIEWER")]) as never);

      await expect(service.createUploadSlots(eventId, callerId, files)).rejects.toBeInstanceOf(ForbiddenException);
      expect(photoStorageService.reserveUploadBytes).not.toHaveBeenCalled();
    });

    it("denies access when the caller has not completed onboarding", async () => {
      prisma.user.findUnique.mockResolvedValue(callerWithoutDetails);
      prisma.event.findUnique.mockResolvedValue(eventWithAccess([callerAccess("ORGANIZER")]) as never);

      await expect(service.createUploadSlots(eventId, callerId, files)).rejects.toBeInstanceOf(ForbiddenException);
      expect(photoStorageService.reserveUploadBytes).not.toHaveBeenCalled();
      expect(prisma.photo.createMany).not.toHaveBeenCalled();
    });

    it("throws PayloadTooLargeException and mints no URLs when the reservation exceeds storage quota", async () => {
      prisma.user.findUnique.mockResolvedValue(callerWithDetails);
      prisma.event.findUnique.mockResolvedValue(eventWithAccess([callerAccess("ORGANIZER")]) as never);
      photoStorageService.reserveUploadBytes.mockRejectedValue(
        new PayloadTooLargeException(PHOTO_SERVICE_ERRORS.STORAGE_QUOTA_EXCEEDED),
      );

      await expect(service.createUploadSlots(eventId, callerId, files)).rejects.toBeInstanceOf(
        PayloadTooLargeException,
      );
      expect(photoStorageService.reserveUploadBytes).toHaveBeenCalledTimes(1);
      expect(s3Service.getPresignedUploadUrl).not.toHaveBeenCalled();
    });

    it("propagates ConflictException and mints no URLs when the reservation keeps conflicting", async () => {
      prisma.user.findUnique.mockResolvedValue(callerWithDetails);
      prisma.event.findUnique.mockResolvedValue(eventWithAccess([callerAccess("ORGANIZER")]) as never);
      photoStorageService.reserveUploadBytes.mockRejectedValue(
        new ConflictException(PHOTO_SERVICE_ERRORS.STORAGE_RESERVATION_CONFLICT),
      );

      await expect(service.createUploadSlots(eventId, callerId, files)).rejects.toBeInstanceOf(ConflictException);
      expect(s3Service.getPresignedUploadUrl).not.toHaveBeenCalled();
    });

    it("never inserts rows outside the quota reservation", async () => {
      prisma.user.findUnique.mockResolvedValue(callerWithDetails);
      prisma.event.findUnique.mockResolvedValue(eventWithAccess([callerAccess("ORGANIZER")]) as never);

      await service.createUploadSlots(eventId, callerId, files);

      expect(prisma.photo.createMany).not.toHaveBeenCalled();
      expect(prisma.photo.create).not.toHaveBeenCalled();
    });

    it.each(["ORGANIZER", "PARTICIPANT"] as const)(
      "reserves quota for the PENDING rows, then returns presigned slots for a %s",
      async (accessLevel) => {
        prisma.user.findUnique.mockResolvedValue(callerWithDetails);
        prisma.event.findUnique.mockResolvedValue(eventWithAccess([callerAccess(accessLevel)]) as never);

        const slots = await service.createUploadSlots(eventId, callerId, files);

        expect(photoStorageService.reserveUploadBytes).toHaveBeenCalledTimes(1);
        const [reservedFor, rows] = photoStorageService.reserveUploadBytes.mock.calls[0] as [
          string,
          Record<string, unknown>[],
        ];
        expect(reservedFor).toBe(callerId);
        expect(rows).toHaveLength(files.length);
        for (const [index, row] of rows.entries()) {
          expect(row).toMatchObject({
            eventId,
            addedById: callerId,
            contentType: files[index].contentType,
            sizeBytes: files[index].sizeBytes,
            status: "PENDING",
            s3Key: buildPhotoS3Key(callerId, eventId, row.id as string),
          });
        }

        expect(slots).toHaveLength(files.length);
        for (const [index, slot] of slots.entries()) {
          expect(slot).toEqual({ photoId: rows[index].id, uploadUrl: "https://signed-put" });
        }
        expect(s3Service.getPresignedUploadUrl).toHaveBeenCalledWith({
          key: rows[0].s3Key,
          contentType: files[0].contentType,
          expiresInSeconds: UPLOAD_URL_TTL_SECONDS,
        });
        // URLs are minted only after the reservation has committed.
        expect(photoStorageService.reserveUploadBytes.mock.invocationCallOrder[0]).toBeLessThan(
          s3Service.getPresignedUploadUrl.mock.invocationCallOrder[0],
        );
      },
    );
  });

  describe("confirmUploads", () => {
    const photoId = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
    const otherPhotoId = "cccccccc-cccc-cccc-cccc-cccccccccccc";

    it("throws NotFoundException when the event does not exist", async () => {
      prisma.user.findUnique.mockResolvedValue(callerWithDetails);
      prisma.event.findUnique.mockResolvedValue(null);

      await expect(service.confirmUploads(eventId, callerId, [photoId])).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.photo.findMany).not.toHaveBeenCalled();
    });

    it("throws ForbiddenException when the caller is a viewer", async () => {
      prisma.user.findUnique.mockResolvedValue(callerWithDetails);
      prisma.event.findUnique.mockResolvedValue(eventWithAccess([callerAccess("VIEWER")]) as never);

      await expect(service.confirmUploads(eventId, callerId, [photoId])).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.photo.findMany).not.toHaveBeenCalled();
    });

    it("reports NOT_FOUND for photo ids that are not in the event", async () => {
      prisma.user.findUnique.mockResolvedValue(callerWithDetails);
      prisma.event.findUnique.mockResolvedValue(eventWithAccess([callerAccess("PARTICIPANT")]) as never);
      prisma.photo.findMany.mockResolvedValue([]);

      const results = await service.confirmUploads(eventId, callerId, [photoId]);

      expect(results).toEqual([{ photoId, status: "NOT_FOUND" }]);
      expect(s3Service.headObject).not.toHaveBeenCalled();
      expect(prisma.photo.updateMany).not.toHaveBeenCalled();
    });

    it("reports READY without re-verifying photos that are already READY", async () => {
      prisma.user.findUnique.mockResolvedValue(callerWithDetails);
      prisma.event.findUnique.mockResolvedValue(eventWithAccess([callerAccess("PARTICIPANT")]) as never);
      prisma.photo.findMany.mockResolvedValue([buildPhoto(photoId, { status: "READY" })]);

      const results = await service.confirmUploads(eventId, callerId, [photoId]);

      expect(results).toEqual([{ photoId, status: "READY" }]);
      expect(s3Service.headObject).not.toHaveBeenCalled();
      expect(prisma.photo.updateMany).not.toHaveBeenCalled();
    });

    it("reports MISSING when the object is not in S3 and leaves the row PENDING", async () => {
      prisma.user.findUnique.mockResolvedValue(callerWithDetails);
      prisma.event.findUnique.mockResolvedValue(eventWithAccess([callerAccess("PARTICIPANT")]) as never);
      prisma.photo.findMany.mockResolvedValue([buildPhoto(photoId)]);
      s3Service.headObject.mockResolvedValue({ exists: false });

      const results = await service.confirmUploads(eventId, callerId, [photoId]);

      expect(results).toEqual([{ photoId, status: "MISSING" }]);
      expect(prisma.photo.updateMany).not.toHaveBeenCalled();
    });

    it.each([
      ["contentType", { contentType: "image/png", sizeBytes: 1024 }],
      ["sizeBytes", { contentType: "image/jpeg", sizeBytes: 999 }],
    ])("reports MISMATCHED when the uploaded object differs in %s", async (_field, head) => {
      prisma.user.findUnique.mockResolvedValue(callerWithDetails);
      prisma.event.findUnique.mockResolvedValue(eventWithAccess([callerAccess("PARTICIPANT")]) as never);
      prisma.photo.findMany.mockResolvedValue([buildPhoto(photoId)]);
      s3Service.headObject.mockResolvedValue({ exists: true, ...head });

      const results = await service.confirmUploads(eventId, callerId, [photoId]);

      expect(results).toEqual([{ photoId, status: "MISMATCHED" }]);
      expect(prisma.photo.updateMany).not.toHaveBeenCalled();
    });

    it("flips verified photos to READY and reports per-photo results for a mixed batch", async () => {
      prisma.user.findUnique.mockResolvedValue(callerWithDetails);
      prisma.event.findUnique.mockResolvedValue(eventWithAccess([callerAccess("PARTICIPANT")]) as never);
      prisma.photo.findMany.mockResolvedValue([buildPhoto(photoId), buildPhoto(otherPhotoId)]);
      s3Service.headObject
        .mockResolvedValueOnce({ exists: true, contentType: "image/jpeg", sizeBytes: 1024 })
        .mockResolvedValueOnce({ exists: false });
      prisma.photo.updateMany.mockResolvedValue({ count: 1 });

      const results = await service.confirmUploads(eventId, callerId, [photoId, otherPhotoId]);

      expect(results).toEqual([
        { photoId, status: "READY" },
        { photoId: otherPhotoId, status: "MISSING" },
      ]);
      expect(s3Service.headObject).toHaveBeenCalledWith(buildPhotoS3Key(callerId, eventId, photoId));
      expect(prisma.photo.updateMany).toHaveBeenCalledWith({
        where: { id: { in: [photoId] } },
        data: { status: "READY" },
      });
    });

    it("deduplicates repeated photo ids in the request", async () => {
      prisma.user.findUnique.mockResolvedValue(callerWithDetails);
      prisma.event.findUnique.mockResolvedValue(eventWithAccess([callerAccess("PARTICIPANT")]) as never);
      prisma.photo.findMany.mockResolvedValue([buildPhoto(photoId)]);
      s3Service.headObject.mockResolvedValue({ exists: true, contentType: "image/jpeg", sizeBytes: 1024 });
      prisma.photo.updateMany.mockResolvedValue({ count: 1 });

      const results = await service.confirmUploads(eventId, callerId, [photoId, photoId]);

      expect(results).toEqual([{ photoId, status: "READY" }]);
      expect(s3Service.headObject).toHaveBeenCalledTimes(1);
    });
  });

  describe("listPhotos", () => {
    const readyPhotos = (count: number) =>
      Array.from({ length: count }, (_, index) =>
        buildPhoto(`dddddddd-dddd-dddd-dddd-${String(index).padStart(12, "0")}`, { status: "READY" }),
      );

    it("throws NotFoundException when the event does not exist", async () => {
      prisma.user.findUnique.mockResolvedValue(callerWithDetails);
      prisma.event.findUnique.mockResolvedValue(null);

      await expect(service.listPhotos(eventId, callerId, {})).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.photo.findMany).not.toHaveBeenCalled();
    });

    it("throws ForbiddenException when the caller is not a member of the event", async () => {
      prisma.user.findUnique.mockResolvedValue(callerWithDetails);
      prisma.event.findUnique.mockResolvedValue(eventWithAccess([]) as never);

      await expect(service.listPhotos(eventId, callerId, {})).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.photo.findMany).not.toHaveBeenCalled();
    });

    it("returns photos with presigned download URLs for a viewer", async () => {
      prisma.user.findUnique.mockResolvedValue(callerWithDetails);
      prisma.event.findUnique.mockResolvedValue(eventWithAccess([callerAccess("VIEWER")]) as never);
      const photos = readyPhotos(2);
      prisma.photo.findMany.mockResolvedValue(photos);

      const page = await service.listPhotos(eventId, callerId, {});

      expect(page.items).toEqual(photos.map((photo) => ({ ...photo, url: "https://signed-get" })));
      expect(page.nextCursor).toBeNull();
      expect(s3Service.getPresignedDownloadUrl).toHaveBeenCalledWith({
        key: photos[0].s3Key,
        expiresInSeconds: 900,
      });
    });

    it("queries only READY photos newest first with the default page size", async () => {
      prisma.user.findUnique.mockResolvedValue(callerWithDetails);
      prisma.event.findUnique.mockResolvedValue(eventWithAccess([callerAccess("VIEWER")]) as never);
      prisma.photo.findMany.mockResolvedValue([]);

      await service.listPhotos(eventId, callerId, {});

      expect(prisma.photo.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { AND: [{ eventId, status: "READY" }, expect.anything()] },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: 51,
        }),
      );
    });

    it("returns a nextCursor when more photos exist and trims the page to the limit", async () => {
      prisma.user.findUnique.mockResolvedValue(callerWithDetails);
      prisma.event.findUnique.mockResolvedValue(eventWithAccess([callerAccess("VIEWER")]) as never);
      const photos = readyPhotos(3);
      prisma.photo.findMany.mockResolvedValue(photos);

      const page = await service.listPhotos(eventId, callerId, { limit: 2 });

      expect(page.items).toHaveLength(2);
      expect(page.nextCursor).toBe(photos[1].id);
      expect(s3Service.getPresignedDownloadUrl).toHaveBeenCalledTimes(2);
    });

    it("passes the cursor to Prisma keyset pagination, skipping the cursor row", async () => {
      prisma.user.findUnique.mockResolvedValue(callerWithDetails);
      prisma.event.findUnique.mockResolvedValue(eventWithAccess([callerAccess("VIEWER")]) as never);
      prisma.photo.findMany.mockResolvedValue([]);
      const cursor = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee";

      await service.listPhotos(eventId, callerId, { cursor, limit: 10 });

      expect(prisma.photo.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ cursor: { id: cursor }, skip: 1, take: 11 }),
      );
    });

    it("denies access when the caller has not completed onboarding", async () => {
      prisma.user.findUnique.mockResolvedValue(callerWithoutDetails);
      prisma.event.findUnique.mockResolvedValue(eventWithAccess([callerAccess("VIEWER")]) as never);

      await expect(service.listPhotos(eventId, callerId, {})).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe("findOne", () => {
    const photoId = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

    const photoWithEvent = (access: EventAccess[], overrides: Partial<Photo> = {}) => ({
      ...buildPhoto(photoId, { status: "READY", ...overrides }),
      event: { ...event, eventAccesses: access },
    });

    it("throws NotFoundException when the photo does not exist", async () => {
      prisma.user.findUnique.mockResolvedValue(callerWithDetails);
      prisma.photo.findUnique.mockResolvedValue(null);

      await expect(service.findOne(photoId, callerId)).rejects.toBeInstanceOf(NotFoundException);
    });

    it("throws NotFoundException for photos that are not READY", async () => {
      prisma.user.findUnique.mockResolvedValue(callerWithDetails);
      prisma.photo.findUnique.mockResolvedValue(
        photoWithEvent([callerAccess("ORGANIZER")], {
          status: "PENDING",
        }) as never,
      );

      await expect(service.findOne(photoId, callerId)).rejects.toBeInstanceOf(NotFoundException);
      expect(s3Service.getPresignedDownloadUrl).not.toHaveBeenCalled();
    });

    it("throws ForbiddenException when the caller is not a member of the event", async () => {
      prisma.user.findUnique.mockResolvedValue(callerWithDetails);
      prisma.photo.findUnique.mockResolvedValue(photoWithEvent([]) as never);

      await expect(service.findOne(photoId, callerId)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("returns the photo with a presigned download URL for a viewer", async () => {
      prisma.user.findUnique.mockResolvedValue(callerWithDetails);
      prisma.photo.findUnique.mockResolvedValue(photoWithEvent([callerAccess("VIEWER")]) as never);

      const result = await service.findOne(photoId, callerId);

      expect(result).toEqual({ ...buildPhoto(photoId, { status: "READY" }), url: "https://signed-get" });
      expect(result).not.toHaveProperty("event");
      expect(s3Service.getPresignedDownloadUrl).toHaveBeenCalledWith({
        key: buildPhotoS3Key(callerId, eventId, photoId),
        expiresInSeconds: 900,
      });
    });
  });

  describe("deletePhoto", () => {
    const photoId = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

    const photoWithEvent = (access: EventAccess[], overrides: Partial<Photo> = {}) => ({
      ...buildPhoto(photoId, { status: "READY", ...overrides }),
      event: { ...event, eventAccesses: access },
    });

    it("throws NotFoundException when the photo does not exist", async () => {
      prisma.user.findUnique.mockResolvedValue(callerWithDetails);
      prisma.photo.findUnique.mockResolvedValue(null);

      await expect(service.deletePhoto(photoId, callerId)).rejects.toBeInstanceOf(NotFoundException);
      expect(s3Service.deleteObject).not.toHaveBeenCalled();
    });

    it("throws ForbiddenException when a participant deletes someone else's photo", async () => {
      prisma.user.findUnique.mockResolvedValue(callerWithDetails);
      prisma.photo.findUnique.mockResolvedValue(
        photoWithEvent([callerAccess("PARTICIPANT")], {
          addedById: "22222222-2222-2222-2222-222222222222",
        }) as never,
      );

      await expect(service.deletePhoto(photoId, callerId)).rejects.toBeInstanceOf(ForbiddenException);
      expect(s3Service.deleteObject).not.toHaveBeenCalled();
      expect(prisma.photo.delete).not.toHaveBeenCalled();
    });

    it("lets an organizer delete any photo, removing the S3 object before the row", async () => {
      prisma.user.findUnique.mockResolvedValue(callerWithDetails);
      prisma.photo.findUnique.mockResolvedValue(
        photoWithEvent([callerAccess("ORGANIZER")], {
          addedById: "22222222-2222-2222-2222-222222222222",
        }) as never,
      );

      await service.deletePhoto(photoId, callerId);

      expect(s3Service.deleteObject).toHaveBeenCalledWith(buildPhotoS3Key(callerId, eventId, photoId));
      expect(prisma.photo.delete).toHaveBeenCalledWith({ where: { id: photoId } });
      expect(s3Service.deleteObject.mock.invocationCallOrder[0]).toBeLessThan(
        prisma.photo.delete.mock.invocationCallOrder[0],
      );
    });

    it("lets an uploader delete their own photo", async () => {
      prisma.user.findUnique.mockResolvedValue(callerWithDetails);
      prisma.photo.findUnique.mockResolvedValue(photoWithEvent([callerAccess("PARTICIPANT")]) as never);

      await service.deletePhoto(photoId, callerId);

      expect(prisma.photo.delete).toHaveBeenCalledWith({ where: { id: photoId } });
    });

    it("keeps the row when the S3 delete fails so the operation can be retried", async () => {
      prisma.user.findUnique.mockResolvedValue(callerWithDetails);
      prisma.photo.findUnique.mockResolvedValue(photoWithEvent([callerAccess("ORGANIZER")]) as never);
      s3Service.deleteObject.mockRejectedValueOnce(new Error("s3 down"));

      await expect(service.deletePhoto(photoId, callerId)).rejects.toBeInstanceOf(Error);
      expect(prisma.photo.delete).not.toHaveBeenCalled();
    });
  });
});
