import { Injectable } from "@nestjs/common";
import { PinoLogger } from "nestjs-pino";
import { EvidenceService } from "src/moderation/evidence/evidence.service";
import { S3Service } from "src/sdk/aws/s3/s3.service";

export interface PhotoPurgeResult {
  requested: number;
  deleted: number;
  failed: number;
  /** Reported objects kept because their evidence copy failed (docs/moderation.md §7). */
  retained: number;
}

export interface PhotoPurgeContext {
  /** Dotted event name for the log line, e.g. `event.photos.purged`. */
  event: string;
  /**
   * Whatever ids identify this purge, named by the caller: an event delete has
   * an eventId and a callerId, an account delete has the deleted userId and no
   * caller at all when the reconciler drives it.
   */
  [key: string]: unknown;
}

/**
 * Removes the S3 objects behind photo rows that are already gone.
 *
 * Best effort by design: the rows were deleted first, so from the user's side
 * the photos are already gone and their quota already released, and the only
 * thing at stake here is storage cost. A key that cannot be deleted now is an
 * orphan, which is exactly what the daily reconciler (§11) reclaims, so this
 * never throws; it reports and logs what it could not do.
 *
 * A reported object is copied to evidence first (EvidenceService). One whose
 * copy fails is not deleted: the evidence job retries the copy.
 */
@Injectable()
export class PhotoPurgeService {
  constructor(
    private readonly s3Service: S3Service,
    private readonly evidenceService: EvidenceService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(this.constructor.name);
  }

  async purgeObjects(keys: string[], context: PhotoPurgeContext): Promise<PhotoPurgeResult> {
    const result: PhotoPurgeResult = { requested: keys.length, deleted: 0, failed: 0, retained: 0 };
    if (keys.length === 0) return result;

    const { deletable, retained } = await this.evidenceService.preserveBeforeDelete(keys);
    result.retained = retained.length;

    if (deletable.length > 0) {
      try {
        const outcome = await this.s3Service.deleteObjects(deletable);
        result.deleted = outcome.deleted.length;
        result.failed = outcome.failed.length;
      } catch {
        // S3Service has logged the transport failure; nothing in this batch was deleted.
        result.failed = deletable.length;
      }
    }

    const summary = { ...context, ...result, audit: true };
    if (result.failed > 0) {
      this.logger.error(summary, "Some photo objects could not be purged; the orphan reconciler will retry them");
    } else {
      this.logger.info(summary, "Photo objects purged");
    }

    return result;
  }
}
