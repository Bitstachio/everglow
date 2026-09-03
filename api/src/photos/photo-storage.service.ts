import { ConflictException, Injectable, PayloadTooLargeException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PhotoStatus, Prisma } from "generated/prisma/client";
import { PinoLogger } from "nestjs-pino";
import { jitteredLinearBackoffMs, sleep } from "src/common/utils/async.utils";
import { isSerializationFailure } from "src/prisma/prisma.errors";
import { PrismaService } from "src/prisma/prisma.service";
import {
  PHOTO_SERVICE_ERRORS,
  STORAGE_QUOTA_EXCEEDED_CODE,
  STORAGE_RESERVATION_CONFLICT_CODE,
  STORAGE_RESERVATION_MAX_ATTEMPTS,
  STORAGE_RESERVATION_RETRY_DELAY_MS,
} from "./photos.constants";

export interface UserStorageSnapshot {
  usedBytes: string;
  limitBytes: string;
  remainingBytes: string;
}

/** A PENDING photo row to insert once its bytes are reserved against the uploader's quota. */
export type UploadReservationRow = Prisma.PhotoCreateManyInput;

@Injectable()
export class PhotoStorageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(this.constructor.name);
  }

  private getLimitBytes(): bigint {
    return this.configService.getOrThrow<bigint>("photos.storageLimitBytes");
  }

  async getUsedBytes(userId: string, db: Prisma.TransactionClient = this.prisma): Promise<bigint> {
    const result = await db.photo.aggregate({
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

  /**
   * Read-only quota check. It is not race-safe on its own: two concurrent
   * callers can both pass it before either inserts a row, so never rely on it
   * to gate an insert — use reserveUploadBytes() for that.
   */
  async assertCanUpload(userId: string, requestedBytes: number): Promise<void> {
    await this.assertWithinQuota(this.prisma, userId, BigInt(requestedBytes));
  }

  /**
   * Atomically checks the uploader's quota and inserts the given PENDING rows.
   *
   * The check and the insert run in one Serializable transaction, so
   * overlapping reservations for the same uploader cannot all slip under the
   * cap: Postgres commits one and aborts the others with a serialization
   * failure. Losers retry (re-reading usage each time) and finally surface as
   * 409. Presigned URLs should be minted only after this resolves, so no
   * transaction is held open across S3 calls.
   */
  async reserveUploadBytes(userId: string, rows: UploadReservationRow[]): Promise<void> {
    const requestedBytes = rows.reduce((sum, row) => sum + BigInt(row.sizeBytes), 0n);

    for (let attempt = 1; attempt <= STORAGE_RESERVATION_MAX_ATTEMPTS; attempt++) {
      try {
        await this.prisma.$transaction(
          async (tx) => {
            await this.assertWithinQuota(tx, userId, requestedBytes);
            await tx.photo.createMany({ data: rows });
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
        return;
      } catch (error) {
        if (!isSerializationFailure(error)) throw error;

        const willRetry = attempt < STORAGE_RESERVATION_MAX_ATTEMPTS;
        this.logger.warn(
          {
            event: "photo.storage.reservation_conflict",
            userId,
            attempt,
            maxAttempts: STORAGE_RESERVATION_MAX_ATTEMPTS,
            willRetry,
          },
          "Storage reservation lost a serialization conflict",
        );
        if (!willRetry) {
          throw new ConflictException({
            code: STORAGE_RESERVATION_CONFLICT_CODE,
            message: PHOTO_SERVICE_ERRORS.STORAGE_RESERVATION_CONFLICT,
          });
        }
        await sleep(jitteredLinearBackoffMs(attempt, STORAGE_RESERVATION_RETRY_DELAY_MS));
      }
    }
  }

  private async assertWithinQuota(db: Prisma.TransactionClient, userId: string, requested: bigint): Promise<void> {
    const usedBytes = await this.getUsedBytes(userId, db);
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
