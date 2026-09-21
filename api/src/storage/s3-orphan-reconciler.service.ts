import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PinoLogger } from "nestjs-pino";
import { S3ObjectSummary, S3Service } from "src/sdk/aws/s3/s3.service";
import { OrphanSource, OrphanSourceRegistry } from "./orphan-source.registry";

export interface S3OrphanReconcileResult {
  /** Objects listed under the registered prefixes. */
  scanned: number;
  /** Listed objects left alone without a lookup: unrecognised key shape, or newer than the minimum age. */
  skipped: number;
  /** Orphans deleted from S3. */
  deleted: number;
  /** Orphans whose S3 delete threw; they are retried on the next run. */
  failed: number;
  /** False when the run hit the batch cap before every prefix was walked. */
  completed: boolean;
}

const HOUR_MS = 60 * 60 * 1000;

/**
 * Deletes S3 objects that no database row references, one registered prefix
 * (`OrphanSource`) at a time.
 *
 * Starts from S3 on purpose: the database is the source of truth, so a row can
 * disappear (delete, cascade, replaced image) or never appear (an upload that
 * was never confirmed) while its object stays in the bucket, billed for
 * nothing. The reconciler knows no feature: each source says which keys under
 * its prefix are its own and which of them are still referenced, and anything
 * a source does not recognise is never touched.
 */
@Injectable()
export class S3OrphanReconcilerService {
  constructor(
    private readonly registry: OrphanSourceRegistry,
    private readonly s3Service: S3Service,
    private readonly configService: ConfigService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(this.constructor.name);
  }

  async reconcileOrphanedObjects(): Promise<S3OrphanReconcileResult> {
    const batchSize = this.configService.getOrThrow<number>("storage.orphanReconcilerBatchSize");
    const minObjectAgeHours = this.configService.getOrThrow<number>("storage.orphanReconcilerMinObjectAgeHours");
    const result: S3OrphanReconcileResult = { scanned: 0, skipped: 0, deleted: 0, failed: 0, completed: false };

    // The cap is shared by all sources: it bounds what one run may delete from
    // the bucket, not what it may delete per feature.
    let withinCap = true;
    for (const source of this.registry.getAll()) {
      withinCap = await this.reconcileSource(source, minObjectAgeHours * HOUR_MS, batchSize, result);
      if (!withinCap) break;
    }

    result.completed = withinCap;
    this.logger.info(
      { event: "storage.orphan_reconcile.completed", ...result, minObjectAgeHours, audit: true },
      "Orphaned S3 object reconcile finished",
    );
    return result;
  }

  /** Walks one prefix end to end; false when the batch cap stopped it early. */
  private async reconcileSource(
    source: OrphanSource,
    minObjectAgeMs: number,
    batchSize: number,
    result: S3OrphanReconcileResult,
  ): Promise<boolean> {
    const cutoff = new Date(Date.now() - Math.max(minObjectAgeMs, source.minObjectAgeMs ?? 0));

    let continuationToken: string | undefined;
    do {
      const page = await this.s3Service.listObjects(source.prefix, continuationToken);
      result.scanned += page.objects.length;

      const candidates = page.objects.filter((object) => this.isCandidate(source, object, cutoff));
      result.skipped += page.objects.length - candidates.length;

      for (const orphan of await this.withoutReference(source, candidates)) {
        if (result.deleted + result.failed >= batchSize) return false;
        await this.deleteOrphan(source, orphan, result);
      }

      continuationToken = page.nextContinuationToken;
    } while (continuationToken);

    return true;
  }

  // Keys outside the source's layout are never ours to delete. An object
  // without a timestamp is treated as brand new for the same reason: when in
  // doubt, keep.
  private isCandidate(source: OrphanSource, object: S3ObjectSummary, cutoff: Date): boolean {
    return source.isOwnedKey(object.key) && object.lastModified !== undefined && object.lastModified <= cutoff;
  }

  // One lookup per S3 page instead of one per key.
  private async withoutReference(source: OrphanSource, candidates: S3ObjectSummary[]): Promise<S3ObjectSummary[]> {
    if (candidates.length === 0) return [];

    const referenced = new Set(await source.findReferencedKeys(candidates.map((object) => object.key)));

    return candidates.filter((object) => !referenced.has(object.key));
  }

  private async deleteOrphan(
    source: OrphanSource,
    object: S3ObjectSummary,
    result: S3OrphanReconcileResult,
  ): Promise<void> {
    try {
      await this.s3Service.deleteObject(object.key);
      result.deleted += 1;
      this.logger.info(
        {
          event: "storage.orphan_reconcile.deleted",
          prefix: source.prefix,
          key: object.key,
          sizeBytes: object.sizeBytes,
          lastModified: object.lastModified,
          audit: true,
        },
        "Deleted orphaned object from S3",
      );
    } catch (error) {
      result.failed += 1;
      this.logger.error(
        {
          err: error as Error,
          event: "storage.orphan_reconcile.delete_failed",
          prefix: source.prefix,
          key: object.key,
        },
        "Failed to delete orphaned object from S3",
      );
    }
  }
}
