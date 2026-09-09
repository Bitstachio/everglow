import { Injectable } from "@nestjs/common";
import { PinoLogger } from "nestjs-pino";
import { S3Service } from "src/sdk/aws/s3/s3.service";

export interface PhotoPurgeResult {
  requested: number;
  deleted: number;
  failed: number;
}

export interface PhotoPurgeContext {
  /** Dotted event name for the log line, e.g. `event.photos.purged`. */
  event: string;
  eventId: string;
  callerId: string;
}

/**
 * Removes the S3 objects behind photo rows that are already gone.
 *
 * Best effort by design: the rows were deleted first, so from the user's side
 * the photos are already gone and their quota already released, and the only
 * thing at stake here is storage cost. A key that cannot be deleted now is an
 * orphan, which is exactly what the daily reconciler (§11) reclaims, so this
 * never throws; it reports and logs what it could not do.
 */
@Injectable()
export class PhotoPurgeService {
  constructor(
    private readonly s3Service: S3Service,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(this.constructor.name);
  }

  async purgeObjects(keys: string[], context: PhotoPurgeContext): Promise<PhotoPurgeResult> {
    const result: PhotoPurgeResult = { requested: keys.length, deleted: 0, failed: 0 };
    if (keys.length === 0) return result;

    try {
      const outcome = await this.s3Service.deleteObjects(keys);
      result.deleted = outcome.deleted.length;
      result.failed = outcome.failed.length;
    } catch {
      // S3Service has logged the transport failure; nothing in this batch was deleted.
      result.failed = keys.length;
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
