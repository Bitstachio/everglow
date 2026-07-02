import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { Event, EventAccess, Gallery, Photo, PrismaClient } from "generated/prisma/client";
import { DeepMockProxy, mockDeep } from "jest-mock-extended";
import { PinoLogger } from "nestjs-pino";
import { AbilityFactory } from "src/casl/ability.factory";
import { PrismaService } from "src/prisma/prisma.service";
import { S3Service } from "src/sdk/aws/s3/s3.service";
import { UserWithDetails } from "src/users/users.types";
import { UploadFileDto } from "./dto/create-upload-urls.dto";
import { UPLOAD_URL_TTL_SECONDS } from "./photos.constants";
import { PhotosService } from "./photos.service";

describe("PhotosService", () => {
  let service: PhotosService;
  let prisma: DeepMockProxy<PrismaClient>;
  let s3Service: { getPresignedUploadUrl: jest.Mock; headObject: jest.Mock };

  const callerId = "11111111-1111-1111-1111-111111111111";
  const eventId = "66666666-6666-6666-6666-666666666666";
  const galleryId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  const now = new Date("2026-06-10T12:00:00.000Z");

  const callerWithoutDetails: UserWithDetails = {
    id: callerId,
    providerSub: "auth0|caller",
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

  const gallery: Gallery = {
    id: galleryId,
    eventId,
    name: "Main",
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

  const galleryWithEvent = (access: EventAccess[]) => ({
    ...gallery,
    event: { ...event, eventAccesses: access },
  });

  const files: UploadFileDto[] = [
    { contentType: "image/jpeg", sizeBytes: 1024 },
    { contentType: "image/png", sizeBytes: 2048 },
  ];

  const buildPhoto = (photoId: string, overrides: Partial<Photo> = {}): Photo => ({
    id: photoId,
    galleryId,
    addedById: callerId,
    s3Key: `photos/${galleryId}/${photoId}`,
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
      headObject: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PhotosService,
        AbilityFactory,
        { provide: PrismaService, useValue: prisma },
        { provide: S3Service, useValue: s3Service },
        {
          provide: PinoLogger,
          useValue: { setContext: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
        },
      ],
    }).compile();

    service = module.get(PhotosService);
  });

  describe("createUploadSlots", () => {
    it("throws NotFoundException when the gallery does not exist", async () => {
      prisma.user.findUnique.mockResolvedValue(callerWithDetails);
      prisma.gallery.findUnique.mockResolvedValue(null);

      await expect(service.createUploadSlots(galleryId, callerId, files)).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.photo.createMany).not.toHaveBeenCalled();
    });

    it("throws ForbiddenException when the caller is not a member of the parent event", async () => {
      prisma.user.findUnique.mockResolvedValue(callerWithDetails);
      prisma.gallery.findUnique.mockResolvedValue(galleryWithEvent([]) as never);

      await expect(service.createUploadSlots(galleryId, callerId, files)).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.photo.createMany).not.toHaveBeenCalled();
    });

    it("throws ForbiddenException when the caller is a viewer", async () => {
      prisma.user.findUnique.mockResolvedValue(callerWithDetails);
      prisma.gallery.findUnique.mockResolvedValue(galleryWithEvent([callerAccess("VIEWER")]) as never);

      await expect(service.createUploadSlots(galleryId, callerId, files)).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.photo.createMany).not.toHaveBeenCalled();
    });

    it("denies access when the caller has not completed onboarding", async () => {
      prisma.user.findUnique.mockResolvedValue(callerWithoutDetails);
      prisma.gallery.findUnique.mockResolvedValue(galleryWithEvent([callerAccess("ORGANIZER")]) as never);

      await expect(service.createUploadSlots(galleryId, callerId, files)).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.photo.createMany).not.toHaveBeenCalled();
    });

    it.each(["ORGANIZER", "PARTICIPANT"] as const)(
      "creates PENDING rows and returns presigned slots for a %s",
      async (accessLevel) => {
        prisma.user.findUnique.mockResolvedValue(callerWithDetails);
        prisma.gallery.findUnique.mockResolvedValue(galleryWithEvent([callerAccess(accessLevel)]) as never);
        prisma.photo.createMany.mockResolvedValue({ count: files.length });

        const slots = await service.createUploadSlots(galleryId, callerId, files);

        expect(prisma.photo.createMany).toHaveBeenCalledTimes(1);
        const { data } = prisma.photo.createMany.mock.calls[0][0] as { data: Record<string, unknown>[] };
        expect(data).toHaveLength(files.length);
        for (const [index, row] of data.entries()) {
          expect(row).toMatchObject({
            galleryId,
            addedById: callerId,
            contentType: files[index].contentType,
            sizeBytes: files[index].sizeBytes,
            status: "PENDING",
            s3Key: `photos/${galleryId}/${row.id as string}`,
          });
        }

        expect(slots).toHaveLength(files.length);
        for (const [index, slot] of slots.entries()) {
          expect(slot).toEqual({ photoId: data[index].id, uploadUrl: "https://signed-put" });
        }
        expect(s3Service.getPresignedUploadUrl).toHaveBeenCalledWith({
          key: data[0].s3Key,
          contentType: files[0].contentType,
          expiresInSeconds: UPLOAD_URL_TTL_SECONDS,
        });
      },
    );
  });

  describe("confirmUploads", () => {
    const photoId = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
    const otherPhotoId = "cccccccc-cccc-cccc-cccc-cccccccccccc";

    it("throws NotFoundException when the gallery does not exist", async () => {
      prisma.user.findUnique.mockResolvedValue(callerWithDetails);
      prisma.gallery.findUnique.mockResolvedValue(null);

      await expect(service.confirmUploads(galleryId, callerId, [photoId])).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.photo.findMany).not.toHaveBeenCalled();
    });

    it("throws ForbiddenException when the caller is a viewer", async () => {
      prisma.user.findUnique.mockResolvedValue(callerWithDetails);
      prisma.gallery.findUnique.mockResolvedValue(galleryWithEvent([callerAccess("VIEWER")]) as never);

      await expect(service.confirmUploads(galleryId, callerId, [photoId])).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.photo.findMany).not.toHaveBeenCalled();
    });

    it("reports NOT_FOUND for photo ids that are not in the gallery", async () => {
      prisma.user.findUnique.mockResolvedValue(callerWithDetails);
      prisma.gallery.findUnique.mockResolvedValue(galleryWithEvent([callerAccess("PARTICIPANT")]) as never);
      prisma.photo.findMany.mockResolvedValue([]);

      const results = await service.confirmUploads(galleryId, callerId, [photoId]);

      expect(results).toEqual([{ photoId, status: "NOT_FOUND" }]);
      expect(s3Service.headObject).not.toHaveBeenCalled();
      expect(prisma.photo.updateMany).not.toHaveBeenCalled();
    });

    it("reports READY without re-verifying photos that are already READY", async () => {
      prisma.user.findUnique.mockResolvedValue(callerWithDetails);
      prisma.gallery.findUnique.mockResolvedValue(galleryWithEvent([callerAccess("PARTICIPANT")]) as never);
      prisma.photo.findMany.mockResolvedValue([buildPhoto(photoId, { status: "READY" })]);

      const results = await service.confirmUploads(galleryId, callerId, [photoId]);

      expect(results).toEqual([{ photoId, status: "READY" }]);
      expect(s3Service.headObject).not.toHaveBeenCalled();
      expect(prisma.photo.updateMany).not.toHaveBeenCalled();
    });

    it("reports MISSING when the object is not in S3 and leaves the row PENDING", async () => {
      prisma.user.findUnique.mockResolvedValue(callerWithDetails);
      prisma.gallery.findUnique.mockResolvedValue(galleryWithEvent([callerAccess("PARTICIPANT")]) as never);
      prisma.photo.findMany.mockResolvedValue([buildPhoto(photoId)]);
      s3Service.headObject.mockResolvedValue({ exists: false });

      const results = await service.confirmUploads(galleryId, callerId, [photoId]);

      expect(results).toEqual([{ photoId, status: "MISSING" }]);
      expect(prisma.photo.updateMany).not.toHaveBeenCalled();
    });

    it.each([
      ["contentType", { contentType: "image/png", sizeBytes: 1024 }],
      ["sizeBytes", { contentType: "image/jpeg", sizeBytes: 999 }],
    ])("reports MISMATCHED when the uploaded object differs in %s", async (_field, head) => {
      prisma.user.findUnique.mockResolvedValue(callerWithDetails);
      prisma.gallery.findUnique.mockResolvedValue(galleryWithEvent([callerAccess("PARTICIPANT")]) as never);
      prisma.photo.findMany.mockResolvedValue([buildPhoto(photoId)]);
      s3Service.headObject.mockResolvedValue({ exists: true, ...head });

      const results = await service.confirmUploads(galleryId, callerId, [photoId]);

      expect(results).toEqual([{ photoId, status: "MISMATCHED" }]);
      expect(prisma.photo.updateMany).not.toHaveBeenCalled();
    });

    it("flips verified photos to READY and reports per-photo results for a mixed batch", async () => {
      prisma.user.findUnique.mockResolvedValue(callerWithDetails);
      prisma.gallery.findUnique.mockResolvedValue(galleryWithEvent([callerAccess("PARTICIPANT")]) as never);
      prisma.photo.findMany.mockResolvedValue([buildPhoto(photoId), buildPhoto(otherPhotoId)]);
      s3Service.headObject
        .mockResolvedValueOnce({ exists: true, contentType: "image/jpeg", sizeBytes: 1024 })
        .mockResolvedValueOnce({ exists: false });
      prisma.photo.updateMany.mockResolvedValue({ count: 1 });

      const results = await service.confirmUploads(galleryId, callerId, [photoId, otherPhotoId]);

      expect(results).toEqual([
        { photoId, status: "READY" },
        { photoId: otherPhotoId, status: "MISSING" },
      ]);
      expect(s3Service.headObject).toHaveBeenCalledWith(`photos/${galleryId}/${photoId}`);
      expect(prisma.photo.updateMany).toHaveBeenCalledWith({
        where: { id: { in: [photoId] } },
        data: { status: "READY" },
      });
    });

    it("deduplicates repeated photo ids in the request", async () => {
      prisma.user.findUnique.mockResolvedValue(callerWithDetails);
      prisma.gallery.findUnique.mockResolvedValue(galleryWithEvent([callerAccess("PARTICIPANT")]) as never);
      prisma.photo.findMany.mockResolvedValue([buildPhoto(photoId)]);
      s3Service.headObject.mockResolvedValue({ exists: true, contentType: "image/jpeg", sizeBytes: 1024 });
      prisma.photo.updateMany.mockResolvedValue({ count: 1 });

      const results = await service.confirmUploads(galleryId, callerId, [photoId, photoId]);

      expect(results).toEqual([{ photoId, status: "READY" }]);
      expect(s3Service.headObject).toHaveBeenCalledTimes(1);
    });
  });
});
