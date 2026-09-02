import { PayloadTooLargeException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
import { PhotoStatus, PrismaClient } from "generated/prisma/client";
import { DeepMockProxy, mockDeep } from "jest-mock-extended";
import { PrismaService } from "src/prisma/prisma.service";
import {
  FREE_TIER_STORAGE_LIMIT_BYTES,
  PHOTO_SERVICE_ERRORS,
  STORAGE_QUOTA_EXCEEDED_CODE,
} from "./photos.constants";
import { PhotoStorageService } from "./photo-storage.service";

describe("PhotoStorageService", () => {
  let service: PhotoStorageService;
  let prisma: DeepMockProxy<PrismaClient>;

  const userId = "11111111-1111-1111-1111-111111111111";

  beforeEach(async () => {
    prisma = mockDeep<PrismaClient>();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PhotoStorageService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: jest.fn(() => FREE_TIER_STORAGE_LIMIT_BYTES),
          },
        },
      ],
    }).compile();

    service = module.get(PhotoStorageService);
  });

  it("returns storage usage for a user", async () => {
    prisma.photo.aggregate.mockResolvedValue({ _sum: { sizeBytes: 1024 } } as never);

    await expect(service.getStorageForUser(userId)).resolves.toEqual({
      usedBytes: "1024",
      limitBytes: FREE_TIER_STORAGE_LIMIT_BYTES.toString(),
      remainingBytes: (FREE_TIER_STORAGE_LIMIT_BYTES - 1024n).toString(),
    });

    expect(prisma.photo.aggregate).toHaveBeenCalledWith({
      where: {
        addedById: userId,
        status: { in: [PhotoStatus.PENDING, PhotoStatus.READY] },
      },
      _sum: { sizeBytes: true },
    });
  });

  it("allows uploads within the remaining quota", async () => {
    prisma.photo.aggregate.mockResolvedValue({ _sum: { sizeBytes: 100 } } as never);

    await expect(service.assertCanUpload(userId, 200)).resolves.toBeUndefined();
  });

  it("rejects uploads that would exceed the quota", async () => {
    const usedBytes = FREE_TIER_STORAGE_LIMIT_BYTES - 100n;
    prisma.photo.aggregate.mockResolvedValue({ _sum: { sizeBytes: Number(usedBytes) } } as never);

    await expect(service.assertCanUpload(userId, 200)).rejects.toMatchObject({
      response: {
        code: STORAGE_QUOTA_EXCEEDED_CODE,
        message: PHOTO_SERVICE_ERRORS.STORAGE_QUOTA_EXCEEDED,
        usedBytes: usedBytes.toString(),
        limitBytes: FREE_TIER_STORAGE_LIMIT_BYTES.toString(),
        requestedBytes: "200",
      },
    });
    await expect(service.assertCanUpload(userId, 200)).rejects.toBeInstanceOf(PayloadTooLargeException);
  });
});
