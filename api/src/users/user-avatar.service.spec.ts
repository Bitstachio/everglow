import {
  ConflictException,
  InternalServerErrorException,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { PrismaClient } from "generated/prisma/client";
import { DeepMockProxy, mockDeep } from "jest-mock-extended";
import { PinoLogger } from "nestjs-pino";
import { ImageUploadService } from "src/images/image-upload.service";
import {
  buildImageS3Key,
  IMAGE_UPLOAD_CONFIRM_WINDOW_SECONDS,
  IMAGE_UPLOAD_ERRORS,
  MAX_IMAGE_SIZE_BYTES,
} from "src/images/images.constants";
import { FREE_TIER_STORAGE_LIMIT_BYTES } from "src/photos/photos.constants";
import { PrismaService } from "src/prisma/prisma.service";
import { S3Service } from "src/sdk/aws/s3/s3.service";
import { UserAvatarService } from "./user-avatar.service";
import { USER_AVATAR_S3_KEY_PREFIX, USER_SERVICE_ERRORS } from "./users.constants";
import { UsersService } from "./users.service";
import { UserWithDetails } from "./users.types";

// The real ImageUploadService runs against a stubbed S3Service: what matters
// here is the avatar flow end to end (key derivation, verification, ordering,
// the conditional row write), not a re-statement of calls into a mock of it.
describe("UserAvatarService", () => {
  let service: UserAvatarService;
  let prisma: DeepMockProxy<PrismaClient>;
  let usersService: { getById: jest.Mock; getOnboardedById: jest.Mock };
  let s3Service: {
    getPresignedUploadUrl: jest.Mock;
    getPresignedDownloadUrl: jest.Mock;
    headObject: jest.Mock;
    deleteObject: jest.Mock;
  };
  let logger: { setContext: jest.Mock; info: jest.Mock; warn: jest.Mock; error: jest.Mock };

  const userId = "11111111-1111-1111-1111-111111111111";
  const uploadId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  const previousUploadId = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
  const avatarKey = buildImageS3Key(USER_AVATAR_S3_KEY_PREFIX, userId, uploadId);
  const previousAvatarKey = buildImageS3Key(USER_AVATAR_S3_KEY_PREFIX, userId, previousUploadId);
  const now = new Date("2026-06-10T12:00:00.000Z");

  const userWithAvatar = (avatarS3Key: string | null): UserWithDetails => ({
    id: userId,
    providerSub: "auth0|abc123",
    storageLimitBytes: FREE_TIER_STORAGE_LIMIT_BYTES,
    deletionStartedAt: null,
    auth0DeletedAt: null,
    deletionPhotoPolicy: null,
    deletionAttempts: 0,
    createdAt: now,
    updatedAt: now,
    details: {
      id: "22222222-2222-2222-2222-222222222222",
      userId,
      username: "jane",
      email: "jane@example.com",
      name: "Jane Doe",
      avatarS3Key,
      createdAt: now,
      updatedAt: now,
    },
  });

  const uploadedObject = (overrides: Record<string, unknown> = {}) => ({
    exists: true,
    contentType: "image/jpeg",
    sizeBytes: 2048,
    lastModified: new Date(),
    ...overrides,
  });

  const notOnboarded = new UnprocessableEntityException(USER_SERVICE_ERRORS.ONBOARDING_INCOMPLETE);

  beforeEach(async () => {
    prisma = mockDeep<PrismaClient>();
    prisma.userDetails.updateMany.mockResolvedValue({ count: 1 });
    usersService = {
      getById: jest.fn().mockResolvedValue(userWithAvatar(avatarKey)),
      getOnboardedById: jest.fn().mockResolvedValue(userWithAvatar(null)),
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
        UserAvatarService,
        ImageUploadService,
        { provide: PrismaService, useValue: prisma },
        { provide: UsersService, useValue: usersService },
        { provide: S3Service, useValue: s3Service },
        { provide: PinoLogger, useValue: logger },
      ],
    }).compile();

    service = module.get(UserAvatarService);
  });

  describe("createUpload", () => {
    it("mints an upload under avatars/{userId}/ for an onboarded user", async () => {
      const result = await service.createUpload(userId, { contentType: "image/jpeg", sizeBytes: 2048 });

      expect(result.uploadUrl).toBe("https://s3.example/put?sig=1");
      expect(s3Service.getPresignedUploadUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          key: buildImageS3Key(USER_AVATAR_S3_KEY_PREFIX, userId, result.uploadId),
          contentType: "image/jpeg",
          contentLength: 2048,
        }),
      );
    });

    it("refuses before onboarding without minting anything", async () => {
      usersService.getOnboardedById.mockRejectedValue(notOnboarded);

      await expect(service.createUpload(userId, { contentType: "image/jpeg", sizeBytes: 2048 })).rejects.toThrow(
        notOnboarded,
      );

      expect(s3Service.getPresignedUploadUrl).not.toHaveBeenCalled();
    });

    it("writes nothing to the database: uploads are stateless", async () => {
      await service.createUpload(userId, { contentType: "image/jpeg", sizeBytes: 2048 });

      expect(prisma.userDetails.updateMany).not.toHaveBeenCalled();
      expect(logger.info).not.toHaveBeenCalled();
    });
  });

  describe("confirmUpload", () => {
    it("verifies the caller's own key, sets it, and returns the refreshed user", async () => {
      const result = await service.confirmUpload(userId, uploadId);

      expect(s3Service.headObject).toHaveBeenCalledWith(avatarKey);
      expect(prisma.userDetails.updateMany).toHaveBeenCalledWith({
        where: { userId, avatarS3Key: null },
        data: { avatarS3Key: avatarKey },
      });
      expect(s3Service.deleteObject).not.toHaveBeenCalled();
      expect(result).toEqual(userWithAvatar(avatarKey));
      expect(logger.info).toHaveBeenCalledWith(
        { event: "user.avatar.set", userId, uploadId, replaced: false, audit: true },
        "User avatar set",
      );
    });

    it("deletes the replaced avatar's object before pointing the row at the new one", async () => {
      usersService.getOnboardedById.mockResolvedValue(userWithAvatar(previousAvatarKey));

      await service.confirmUpload(userId, uploadId);

      expect(s3Service.deleteObject).toHaveBeenCalledTimes(1);
      expect(s3Service.deleteObject).toHaveBeenCalledWith(previousAvatarKey);
      expect(prisma.userDetails.updateMany).toHaveBeenCalledWith({
        where: { userId, avatarS3Key: previousAvatarKey },
        data: { avatarS3Key: avatarKey },
      });
      expect(s3Service.deleteObject.mock.invocationCallOrder[0]).toBeLessThan(
        prisma.userDetails.updateMany.mock.invocationCallOrder[0],
      );
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({ event: "user.avatar.set", replaced: true, audit: true }),
        expect.any(String),
      );
    });

    it("keeps the current avatar when its object cannot be deleted", async () => {
      usersService.getOnboardedById.mockResolvedValue(userWithAvatar(previousAvatarKey));
      s3Service.deleteObject.mockRejectedValue(new InternalServerErrorException("s3 down"));

      await expect(service.confirmUpload(userId, uploadId)).rejects.toThrow(InternalServerErrorException);

      expect(prisma.userDetails.updateMany).not.toHaveBeenCalled();
      expect(logger.info).not.toHaveBeenCalled();
    });

    it("is idempotent for the avatar that is already set", async () => {
      const current = userWithAvatar(avatarKey);
      usersService.getOnboardedById.mockResolvedValue(current);

      await expect(service.confirmUpload(userId, uploadId)).resolves.toBe(current);

      expect(s3Service.headObject).not.toHaveBeenCalled();
      expect(s3Service.deleteObject).not.toHaveBeenCalled();
      expect(prisma.userDetails.updateMany).not.toHaveBeenCalled();
      expect(logger.info).not.toHaveBeenCalled();
    });

    it("reports 404 when nothing was uploaded", async () => {
      s3Service.headObject.mockResolvedValue({ exists: false });

      await expect(service.confirmUpload(userId, uploadId)).rejects.toThrow(
        new NotFoundException(IMAGE_UPLOAD_ERRORS.UPLOAD_NOT_FOUND(uploadId)),
      );

      expect(prisma.userDetails.updateMany).not.toHaveBeenCalled();
    });

    it.each([
      ["a disallowed content type", { contentType: "image/heic" }],
      ["an oversize object", { sizeBytes: MAX_IMAGE_SIZE_BYTES + 1 }],
    ])("discards %s and keeps the current avatar", async (_label, overrides) => {
      usersService.getOnboardedById.mockResolvedValue(userWithAvatar(previousAvatarKey));
      s3Service.headObject.mockResolvedValue(uploadedObject(overrides));

      await expect(service.confirmUpload(userId, uploadId)).rejects.toThrow(
        new UnprocessableEntityException(IMAGE_UPLOAD_ERRORS.UPLOAD_REJECTED(uploadId)),
      );

      expect(s3Service.deleteObject).toHaveBeenCalledTimes(1);
      expect(s3Service.deleteObject).toHaveBeenCalledWith(avatarKey);
      expect(prisma.userDetails.updateMany).not.toHaveBeenCalled();
    });

    it("rejects an upload left unconfirmed past the window", async () => {
      const lastModified = new Date(Date.now() - (IMAGE_UPLOAD_CONFIRM_WINDOW_SECONDS + 60) * 1000);
      s3Service.headObject.mockResolvedValue(uploadedObject({ lastModified }));

      await expect(service.confirmUpload(userId, uploadId)).rejects.toThrow(
        new UnprocessableEntityException(IMAGE_UPLOAD_ERRORS.UPLOAD_EXPIRED(uploadId)),
      );

      expect(prisma.userDetails.updateMany).not.toHaveBeenCalled();
    });

    it("tells the loser of two racing confirms to retry instead of orphaning the winner's object", async () => {
      prisma.userDetails.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.confirmUpload(userId, uploadId)).rejects.toThrow(
        new ConflictException(USER_SERVICE_ERRORS.AVATAR_CHANGED_CONCURRENTLY),
      );

      expect(logger.info).not.toHaveBeenCalled();
    });

    it("refuses before onboarding without touching S3", async () => {
      usersService.getOnboardedById.mockRejectedValue(notOnboarded);

      await expect(service.confirmUpload(userId, uploadId)).rejects.toThrow(notOnboarded);

      expect(s3Service.headObject).not.toHaveBeenCalled();
    });
  });

  describe("remove", () => {
    it("deletes the object, then clears the column", async () => {
      usersService.getOnboardedById.mockResolvedValue(userWithAvatar(avatarKey));

      await service.remove(userId);

      expect(s3Service.deleteObject).toHaveBeenCalledWith(avatarKey);
      expect(prisma.userDetails.updateMany).toHaveBeenCalledWith({
        where: { userId, avatarS3Key: avatarKey },
        data: { avatarS3Key: null },
      });
      expect(s3Service.deleteObject.mock.invocationCallOrder[0]).toBeLessThan(
        prisma.userDetails.updateMany.mock.invocationCallOrder[0],
      );
      expect(logger.info).toHaveBeenCalledWith(
        { event: "user.avatar.removed", userId, audit: true },
        "User avatar removed",
      );
    });

    it("keeps the avatar when its object cannot be deleted, so the removal can be retried", async () => {
      usersService.getOnboardedById.mockResolvedValue(userWithAvatar(avatarKey));
      s3Service.deleteObject.mockRejectedValue(new InternalServerErrorException("s3 down"));

      await expect(service.remove(userId)).rejects.toThrow(InternalServerErrorException);

      expect(prisma.userDetails.updateMany).not.toHaveBeenCalled();
      expect(logger.info).not.toHaveBeenCalled();
    });

    it("is a silent no-op when there is no avatar", async () => {
      await service.remove(userId);

      expect(s3Service.deleteObject).not.toHaveBeenCalled();
      expect(prisma.userDetails.updateMany).not.toHaveBeenCalled();
      expect(logger.info).not.toHaveBeenCalled();
    });

    it("refuses before onboarding", async () => {
      usersService.getOnboardedById.mockRejectedValue(notOnboarded);

      await expect(service.remove(userId)).rejects.toThrow(notOnboarded);
    });
  });

  describe("getAvatarUrl", () => {
    it("presigns the avatar of a user who has one", async () => {
      await expect(service.getAvatarUrl(userWithAvatar(avatarKey))).resolves.toBe("https://s3.example/get?sig=1");

      expect(s3Service.getPresignedDownloadUrl).toHaveBeenCalledWith(expect.objectContaining({ key: avatarKey }));
    });

    it.each([
      ["without an avatar", userWithAvatar(null)],
      ["who has not onboarded", { ...userWithAvatar(null), details: null }],
    ])("returns null for a user %s", async (_label, user) => {
      await expect(service.getAvatarUrl(user)).resolves.toBeNull();

      expect(s3Service.getPresignedDownloadUrl).not.toHaveBeenCalled();
    });
  });

  // Audit lines identify the principal and the upload; presigned URLs carry a
  // signature and must never reach the logs.
  it("never logs a URL or an S3 key", async () => {
    usersService.getOnboardedById.mockResolvedValue(userWithAvatar(previousAvatarKey));
    await service.confirmUpload(userId, uploadId);
    usersService.getOnboardedById.mockResolvedValue(userWithAvatar(avatarKey));
    await service.remove(userId);

    const logged = JSON.stringify(logger.info.mock.calls);
    expect(logged).not.toContain("https://");
    expect(logged).not.toContain(USER_AVATAR_S3_KEY_PREFIX);
  });
});
