import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PhotoStatus } from "generated/prisma/client";
import { PinoLogger } from "nestjs-pino";
import { PrismaService } from "src/prisma/prisma.service";
import { S3Service } from "src/sdk/aws/s3/s3.service";
import { EXPIRED_UPLOAD_SLOT_AGE_SECONDS } from "./photos.constants";

/** Slots past their upload URL's lifetime: released when S3 holds no object for them, kept when it does. */
export interface ExpiredSlotReleaseResult {
  scanned: number;
  released: number;
  retained: number;
  failed: number;
}

export interface PhotoPendingCleanupResult {
  scanned: number;
  deleted: number;
  failed: number;
  expired: ExpiredSlotReleaseResult;
}

@Injectable()
export class PhotoPendingCleanupService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly s3Service: S3Service,
    private readonly configService: ConfigService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(this.constructor.name);
  }

  async cleanupStalePendingPhotos(): Promise<PhotoPendingCleanupResult> {
    const maxAgeHours = this.configService.getOrThrow<number>("photos.pendingCleanupMaxAgeHours");
    const batchSize = this.configService.getOrThrow<number>("photos.pendingCleanupBatchSize");
    const cutoff = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000);

    const stalePhotos = await this.prisma.photo.findMany({
      where: { status: PhotoStatus.PENDING, createdAt: { lt: cutoff } },
      orderBy: { createdAt: "asc" },
      take: batchSize,
      select: { id: true, s3Key: true, eventId: true },
    });

    let deleted = 0;
    let failed = 0;

    for (const photo of stalePhotos) {
      try {
        await this.s3Service.deleteObject(photo.s3Key);
        await this.prisma.photo.delete({ where: { id: photo.id } });
        deleted += 1;
      } catch (error) {
        failed += 1;
        this.logger.error(
          { err: error as Error, event: "photo.pending_cleanup.failed", photoId: photo.id, eventId: photo.eventId },
          "Failed to clean up stale pending photo",
        );
      }
    }

    if (stalePhotos.length > 0) {
      this.logger.info(
        {
          event: "photo.pending_cleanup.completed",
          scanned: stalePhotos.length,
          deleted,
          failed,
          maxAgeHours,
          audit: true,
        },
        "Stale pending photo cleanup finished",
      );
    }

    const expired = await this.releaseExpiredEmptySlots(cutoff, batchSize);

    return { scanned: stalePhotos.length, deleted, failed, expired };
  }

  /**
   * A slot whose presigned URL has expired (plus grace for a PUT that was
   * already streaming) and whose key holds no object cannot complete: S3
   * accepts no new PUT for it and nothing is in flight. Those are the
   * abandoned-batch and expired-URL cases of #48, and they used to hold quota
   * for the whole stale cutoff while charging for bytes that exist nowhere.
   * Rows are checked youngest-last, and only up to the stale cutoff, which the
   * stale tier above owns.
   *
   * A slot whose object did land is left alone: the uploader may still confirm
   * it, and the stale tier takes it at the cutoff if they never do. Such rows
   * are re-checked every run until then; a HeadObject per row per hour is
   * cheap, and the batch size bounds the work.
   */
  private async releaseExpiredEmptySlots(staleCutoff: Date, batchSize: number): Promise<ExpiredSlotReleaseResult> {
    const expiredCutoff = new Date(Date.now() - EXPIRED_UPLOAD_SLOT_AGE_SECONDS * 1000);

    const candidates = await this.prisma.photo.findMany({
      where: { status: PhotoStatus.PENDING, createdAt: { gte: staleCutoff, lt: expiredCutoff } },
      orderBy: { createdAt: "asc" },
      take: batchSize,
      select: { id: true, s3Key: true, eventId: true },
    });

    let released = 0;
    let retained = 0;
    let failed = 0;

    for (const photo of candidates) {
      try {
        const head = await this.s3Service.headObject(photo.s3Key);
        if (head.exists) {
          retained += 1;
          continue;
        }
        // Guarded on status: if a late PUT landed and a confirm verified it
        // between the head and here, the photo is READY and must survive.
        const { count } = await this.prisma.photo.deleteMany({
          where: { id: photo.id, status: PhotoStatus.PENDING },
        });
        released += count;
      } catch (error) {
        failed += 1;
        this.logger.error(
          {
            err: error as Error,
            event: "photo.pending_cleanup.expired_failed",
            photoId: photo.id,
            eventId: photo.eventId,
          },
          "Failed to release expired upload slot",
        );
      }
    }

    if (candidates.length > 0) {
      this.logger.info(
        {
          event: "photo.pending_cleanup.expired_completed",
          scanned: candidates.length,
          released,
          retained,
          failed,
          expiredAfterSeconds: EXPIRED_UPLOAD_SLOT_AGE_SECONDS,
          audit: true,
        },
        "Expired upload slot release finished",
      );
    }

    return { scanned: candidates.length, released, retained, failed };
  }
}
