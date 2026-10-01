import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { PhotoStatus, Prisma } from "generated/prisma/client";
import { PinoLogger } from "nestjs-pino";
import { ALERT_EVENTS } from "src/common/logging/alert-events.constants";
import { jitteredLinearBackoffMs, sleep } from "src/common/utils/async.utils";
import { EventPlanService, PlannedEvent } from "src/plans/event-plan.service";
import { isSerializationFailure } from "src/prisma/prisma.errors";
import { PrismaService } from "src/prisma/prisma.service";
import { USER_SERVICE_ERRORS } from "src/users/users.constants";
import {
  PHOTO_SERVICE_ERRORS,
  STORAGE_RESERVATION_CONFLICT_CODE,
  STORAGE_RESERVATION_MAX_ATTEMPTS,
  STORAGE_RESERVATION_RETRY_DELAY_MS,
} from "./photos.constants";

export interface UserStorageSnapshot {
  usedBytes: string;
  limitBytes: string;
  remainingBytes: string;
}

/** A PENDING photo row to insert once the event's gallery has room for it. */
export type UploadReservationRow = Prisma.PhotoCreateManyInput;

@Injectable()
export class PhotoStorageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventPlanService: EventPlanService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(this.constructor.name);
  }

  /**
   * A person's uploads against the old personal limit, for the deprecated GET
   * /users/me/storage only. Nothing enforces that limit: each gallery's
   * storage is limited by its event's plan (reserveUploadBytes).
   */
  async getStorageForUser(userId: string): Promise<UserStorageSnapshot> {
    const [limitBytes, usedBytes] = await Promise.all([this.getLimitBytes(userId), this.getUsedBytes(userId)]);
    const remainingBytes = usedBytes >= limitBytes ? 0n : limitBytes - usedBytes;

    return {
      usedBytes: usedBytes.toString(),
      limitBytes: limitBytes.toString(),
      remainingBytes: remainingBytes.toString(),
    };
  }

  /** Bytes of everything a person uploaded, in progress or ready. */
  private async getUsedBytes(userId: string): Promise<bigint> {
    const result = await this.prisma.photo.aggregate({
      where: {
        addedById: userId,
        status: { in: [PhotoStatus.PENDING, PhotoStatus.READY] },
      },
      _sum: { sizeBytes: true },
    });

    return BigInt(result._sum.sizeBytes ?? 0);
  }

  /**
   * Atomically checks the event's gallery has room and inserts the given
   * PENDING rows (docs/event-quotas.md: the gallery storage of the event's
   * plan).
   *
   * The usage query and the insert run in one Serializable transaction, so
   * overlapping reservations for the same gallery cannot all slip under the
   * limit: Postgres commits one and aborts the others with a serialization
   * failure. Losers retry (re-reading usage each time) and finally surface as
   * 409. Presigned URLs should be minted only after this resolves, so no
   * transaction is held open across S3 calls.
   */
  async reserveUploadBytes(event: PlannedEvent, rows: UploadReservationRow[]): Promise<void> {
    this.eventPlanService.assertGalleryOpen(event);
    const requestedBytes = rows.reduce((sum, row) => sum + BigInt(row.sizeBytes), 0n);

    for (let attempt = 1; attempt <= STORAGE_RESERVATION_MAX_ATTEMPTS; attempt++) {
      try {
        await this.prisma.$transaction(
          async (tx) => {
            await this.eventPlanService.assertGalleryHasRoom(tx, event, requestedBytes);
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
            event: ALERT_EVENTS.STORAGE_RESERVATION_CONFLICT,
            eventId: event.id,
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

  /** The old personal limit, `User.storageLimitBytes`, for the deprecated GET /users/me/storage. */
  private async getLimitBytes(userId: string): Promise<bigint> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { storageLimitBytes: true },
    });

    if (!user) throw new NotFoundException(USER_SERVICE_ERRORS.NOT_FOUND(userId));

    return user.storageLimitBytes;
  }
}
