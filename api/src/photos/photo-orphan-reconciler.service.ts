import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PinoLogger } from "nestjs-pino";
import { PrismaService } from "src/prisma/prisma.service";
import { S3ObjectSummary, S3Service } from "src/sdk/aws/s3/s3.service";
import { isPhotoS3Key, PHOTO_S3_KEY_PREFIX } from "./photos.constants";

export interface PhotoOrphanReconcileResult {
  /** Objects listed under the photos/ prefix. */
  scanned: number;
  /** Listed objects left alone without a lookup: unrecognised key shape, or newer than the minimum age. */
  skipped: number;
  /** Orphans deleted from S3. */
  deleted: number;
  /** Orphans whose S3 delete threw; they are retried on the next run. */
  failed: number;
  /** False when the run hit the batch cap before the whole prefix was walked. */
  completed: boolean;
}

const HOUR_MS = 60 * 60 * 1000;

/**
 * Deletes S3 objects under photos/ that no Photo row references.
 *
 * Starts from S3 on purpose: the stale-PENDING cleanup starts from Postgres
 * and handles the opposite failure (a row whose upload never finished). A row
 * is inserted before its upload URL is ever minted, so an object can only
 * exist after its row did; when the lookup finds no row, the row was deleted
 * afterwards (photo delete, event or account cascade) and the bytes are
 * billed for nothing.
 */
@Injectable()
export class PhotoOrphanReconcilerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly s3Service: S3Service,
    private readonly configService: ConfigService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(this.constructor.name);
  }

  async reconcileOrphanedObjects(): Promise<PhotoOrphanReconcileResult> {
    const batchSize = this.configService.getOrThrow<number>("photos.orphanReconcilerBatchSize");
    const minObjectAgeHours = this.configService.getOrThrow<number>("photos.orphanReconcilerMinObjectAgeHours");
    const cutoff = new Date(Date.now() - minObjectAgeHours * HOUR_MS);
    const result: PhotoOrphanReconcileResult = { scanned: 0, skipped: 0, deleted: 0, failed: 0, completed: false };

    let continuationToken: string | undefined;
    do {
      const page = await this.s3Service.listObjects(PHOTO_S3_KEY_PREFIX, continuationToken);
      result.scanned += page.objects.length;

      const candidates = page.objects.filter((object) => this.isCandidate(object, cutoff));
      result.skipped += page.objects.length - candidates.length;

      for (const orphan of await this.withoutPhotoRow(candidates)) {
        if (result.deleted + result.failed >= batchSize) {
          this.logSummary(result, minObjectAgeHours);
          return result;
        }
        await this.deleteOrphan(orphan, result);
      }

      continuationToken = page.nextContinuationToken;
    } while (continuationToken);

    result.completed = true;
    this.logSummary(result, minObjectAgeHours);
    return result;
  }

  // Keys outside the photo layout are never ours to delete. An object without
  // a timestamp is treated as brand new for the same reason: when in doubt, keep.
  private isCandidate(object: S3ObjectSummary, cutoff: Date): boolean {
    return isPhotoS3Key(object.key) && object.lastModified !== undefined && object.lastModified <= cutoff;
  }

  // One indexed query per S3 page (Photo.s3Key is unique) instead of one per key.
  // A row in any status, PENDING included, keeps its object.
  private async withoutPhotoRow(candidates: S3ObjectSummary[]): Promise<S3ObjectSummary[]> {
    if (candidates.length === 0) return [];

    const rows = await this.prisma.photo.findMany({
      where: { s3Key: { in: candidates.map((object) => object.key) } },
      select: { s3Key: true },
    });
    const referenced = new Set(rows.map((row) => row.s3Key));

    return candidates.filter((object) => !referenced.has(object.key));
  }

  private async deleteOrphan(object: S3ObjectSummary, result: PhotoOrphanReconcileResult): Promise<void> {
    try {
      await this.s3Service.deleteObject(object.key);
      result.deleted += 1;
      this.logger.info(
        {
          event: "photo.orphan_reconcile.deleted",
          key: object.key,
          sizeBytes: object.sizeBytes,
          lastModified: object.lastModified,
          audit: true,
        },
        "Deleted orphaned photo object from S3",
      );
    } catch (error) {
      result.failed += 1;
      this.logger.error(
        { err: error as Error, event: "photo.orphan_reconcile.delete_failed", key: object.key },
        "Failed to delete orphaned photo object from S3",
      );
    }
  }

  private logSummary(result: PhotoOrphanReconcileResult, minObjectAgeHours: number): void {
    this.logger.info(
      { event: "photo.orphan_reconcile.completed", ...result, minObjectAgeHours, audit: true },
      "Orphaned photo object reconcile finished",
    );
  }
}
