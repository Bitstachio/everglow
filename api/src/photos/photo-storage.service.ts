import { Injectable, PayloadTooLargeException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PhotoStatus } from "generated/prisma/client";
import { PrismaService } from "src/prisma/prisma.service";
import { PHOTO_SERVICE_ERRORS, STORAGE_QUOTA_EXCEEDED_CODE } from "./photos.constants";

export interface UserStorageSnapshot {
  usedBytes: string;
  limitBytes: string;
  remainingBytes: string;
}

@Injectable()
export class PhotoStorageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  private getLimitBytes(): bigint {
    return this.configService.getOrThrow<bigint>("photos.storageLimitBytes");
  }

  async getUsedBytes(userId: string): Promise<bigint> {
    const result = await this.prisma.photo.aggregate({
      where: {
        addedById: userId,
        status: { in: [PhotoStatus.PENDING, PhotoStatus.READY] },
      },
      _sum: { sizeBytes: true },
    });

    return BigInt(result._sum.sizeBytes ?? 0);
  }

  async getStorageForUser(userId: string): Promise<UserStorageSnapshot> {
    const usedBytes = await this.getUsedBytes(userId);
    const limitBytes = this.getLimitBytes();
    const remainingBytes = usedBytes >= limitBytes ? 0n : limitBytes - usedBytes;

    return {
      usedBytes: usedBytes.toString(),
      limitBytes: limitBytes.toString(),
      remainingBytes: remainingBytes.toString(),
    };
  }

  async assertCanUpload(userId: string, requestedBytes: number): Promise<void> {
    const requested = BigInt(requestedBytes);
    const usedBytes = await this.getUsedBytes(userId);
    const limitBytes = this.getLimitBytes();

    if (usedBytes + requested <= limitBytes) return;

    throw new PayloadTooLargeException({
      code: STORAGE_QUOTA_EXCEEDED_CODE,
      message: PHOTO_SERVICE_ERRORS.STORAGE_QUOTA_EXCEEDED,
      usedBytes: usedBytes.toString(),
      limitBytes: limitBytes.toString(),
      requestedBytes: requested.toString(),
    });
  }
}
