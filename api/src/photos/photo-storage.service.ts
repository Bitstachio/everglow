import { Injectable } from "@nestjs/common";
import { ApiException } from "src/common/errors/api.exception";
import { Prisma } from "generated/prisma/client";
import { PinoLogger } from "nestjs-pino";
import { ALERT_EVENTS } from "src/common/logging/alert-events.constants";
import { jitteredLinearBackoffMs, sleep } from "src/common/utils/async.utils";
import { EventPlanService, PlannedEvent } from "src/plans/event-plan.service";
import { isSerializationFailure } from "src/prisma/prisma.errors";
import { PrismaService } from "src/prisma/prisma.service";
import { STORAGE_RESERVATION_MAX_ATTEMPTS, STORAGE_RESERVATION_RETRY_DELAY_MS } from "./photos.constants";

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
          throw new ApiException("STORAGE_RESERVATION_CONFLICT");
        }
        await sleep(jitteredLinearBackoffMs(attempt, STORAGE_RESERVATION_RETRY_DELAY_MS));
      }
    }
  }
}
