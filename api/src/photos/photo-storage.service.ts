import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
} from "@nestjs/common";
import { PhotoStatus, Prisma } from "generated/prisma/client";
import { PinoLogger } from "nestjs-pino";
import { jitteredLinearBackoffMs, sleep } from "src/common/utils/async.utils";
import { isRecordNotFound, isSerializationFailure } from "src/prisma/prisma.errors";
import { PrismaService } from "src/prisma/prisma.service";
import { USER_SERVICE_ERRORS } from "src/users/users.constants";
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
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(this.constructor.name);
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
    const [limitBytes, usedBytes] = await Promise.all([this.getLimitBytes(userId), this.getUsedBytes(userId)]);
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
   * The limit lookup, the usage query, and the insert run in one Serializable
   * transaction, so overlapping reservations for the same uploader cannot all
   * slip under the cap: Postgres commits one and aborts the others with a
   * serialization failure. Losers retry (re-reading limit and usage each time)
   * and finally surface as 409. Presigned URLs should be minted only after this
   * resolves, so no transaction is held open across S3 calls.
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

  /**
   * Raises the account's ceiling by `additionalBytes` and returns the new limit.
   *
   * Additive on purpose: a purchase grants capacity rather than declaring a
   * total, so two grants that overlap accumulate instead of overwriting each
   * other. Prisma's `increment` is one UPDATE, so there is no read-modify-write
   * window to lose a grant in, and no transaction is needed.
   *
   * Internal only. Billing calls this; nothing routes to it over HTTP, and
   * lowering a limit is deliberately not offered here.
   */
  async addStorageLimit(userId: string, additionalBytes: bigint | number): Promise<bigint> {
    if (typeof additionalBytes === "number" && !Number.isInteger(additionalBytes)) {
      throw new BadRequestException(PHOTO_SERVICE_ERRORS.INVALID_STORAGE_INCREMENT(String(additionalBytes)));
    }

    const increment = BigInt(additionalBytes);
    if (increment <= 0n) {
      throw new BadRequestException(PHOTO_SERVICE_ERRORS.INVALID_STORAGE_INCREMENT(increment.toString()));
    }

    try {
      const { storageLimitBytes } = await this.prisma.user.update({
        where: { id: userId },
        data: { storageLimitBytes: { increment } },
        select: { storageLimitBytes: true },
      });

      this.logger.info(
        {
          event: "user.storage_limit.increased",
          userId,
          additionalBytes: increment.toString(),
          newLimitBytes: storageLimitBytes.toString(),
          audit: true,
        },
        "User storage limit increased",
      );

      return storageLimitBytes;
    } catch (error) {
      if (isRecordNotFound(error)) throw new NotFoundException(USER_SERVICE_ERRORS.NOT_FOUND(userId));
      throw error;
    }
  }

  /**
   * The uploader's own ceiling (`User.storageLimitBytes`). Billing raises it
   * per account; there is no global override. Read through `db` so that inside
   * a transaction it shares the snapshot with the usage query.
   */
  private async getLimitBytes(userId: string, db: Prisma.TransactionClient = this.prisma): Promise<bigint> {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { storageLimitBytes: true },
    });

    if (!user) throw new NotFoundException(USER_SERVICE_ERRORS.NOT_FOUND(userId));

    return user.storageLimitBytes;
  }

  private async assertWithinQuota(db: Prisma.TransactionClient, userId: string, requested: bigint): Promise<void> {
    const limitBytes = await this.getLimitBytes(userId, db);
    const usedBytes = await this.getUsedBytes(userId, db);

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
