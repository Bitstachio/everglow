import { Injectable } from "@nestjs/common";
import { AccountDeletionOutboxAction, Prisma } from "generated/prisma/client";
import { PinoLogger } from "nestjs-pino";
import { ALERT_EVENTS } from "src/common/logging/alert-events.constants";
import { PhotoPurgeService } from "src/photos/photo-purge.service";
import { buildPhotoDerivativeS3Keys, buildPhotoS3Key, withPhotoDerivativeS3Keys } from "src/photos/photos.constants";
import { isUniqueConstraintViolation } from "src/prisma/prisma.errors";
import { PrismaService } from "src/prisma/prisma.service";
import { S3Service } from "src/sdk/aws/s3/s3.service";
import { ACCOUNT_DELETION_OUTBOX_BATCH_SIZE, ACCOUNT_DELETION_OUTBOX_MAX_ATTEMPTS } from "./users.constants";

export interface OutboxDrainResult {
  /** Entries whose work is done (or kept for evidence, which the evidence job owns now). */
  done: number;
  /** Entries whose work failed and stays queued for the next drain. */
  failed: number;
  /** Entries dropped after ACCOUNT_DELETION_OUTBOX_MAX_ATTEMPTS: the S3 orphan reconciler is their backstop. */
  givenUp: number;
}

/** Which entries one drain takes: one account's, or everything left behind before a time. */
export type OutboxScope = { userId: string } | { createdBefore: Date };

/**
 * The S3 side of account deletion, through an outbox (docs/account-deletion.md
 * §4). Prep writes the keys it collects in its own transaction (`enqueue`), so
 * they are durable the moment the rows they belonged to are gone; this drains
 * them after the commit. A pass that fails later, at Apple or Auth0, has
 * already lost nothing: its own drain ran, and a resumed saga or the
 * reconciler drains whatever is left.
 *
 * Every action is safe to repeat, so two drains that overlap (a request and
 * the reconciler) do the same work twice at worst, never the wrong work.
 * Never throws: S3 failures stay queued, a database failure is logged and
 * left for the next drain.
 */
@Injectable()
export class AccountDeletionOutboxService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly photoPurge: PhotoPurgeService,
    private readonly s3Service: S3Service,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(this.constructor.name);
  }

  /** In the caller's transaction: the objects to purge once it commits. */
  async enqueuePurge(tx: Prisma.TransactionClient, userId: string, s3Keys: string[]): Promise<void> {
    if (s3Keys.length === 0) return;
    await tx.accountDeletionOutbox.createMany({
      data: [...new Set(s3Keys)].map((s3Key) => ({ userId, action: AccountDeletionOutboxAction.PURGE, s3Key })),
      skipDuplicates: true,
    });
  }

  /**
   * In the caller's transaction: kept photos to move to a key without the
   * uploader's id once it commits. Copy first, then point the row at the copy,
   * then delete the original, so the photo never stops being viewable.
   */
  async enqueueRekey(
    tx: Prisma.TransactionClient,
    userId: string,
    photos: { id: string; eventId: string; s3Key: string }[],
  ): Promise<void> {
    if (photos.length === 0) return;
    await tx.accountDeletionOutbox.createMany({
      data: photos.map((photo) => ({
        userId,
        action: AccountDeletionOutboxAction.REKEY,
        s3Key: photo.s3Key,
        photoId: photo.id,
        targetS3Key: buildPhotoS3Key(photo.eventId, photo.id),
      })),
      skipDuplicates: true,
    });
  }

  async drain(scope: OutboxScope): Promise<OutboxDrainResult> {
    const result: OutboxDrainResult = { done: 0, failed: 0, givenUp: 0 };
    try {
      await this.drainPurges(scope, result);
      await this.drainRekeys(scope, result);
    } catch (error) {
      this.logger.error(
        { err: error as Error, event: "user.account.deletion_outbox.drain_failed", ...scope },
        "Draining the account deletion outbox failed; the next drain retries",
      );
    }
    return result;
  }

  private async drainPurges(scope: OutboxScope, result: OutboxDrainResult): Promise<void> {
    const where = whereFor(AccountDeletionOutboxAction.PURGE, scope);
    // Keyset pages over the ids, so entries that stay queued after a failure
    // are not read again in the same drain.
    let cursor: string | undefined;
    for (;;) {
      const entries = await this.prisma.accountDeletionOutbox.findMany({
        where: cursor ? { ...where, id: { gt: cursor } } : where,
        orderBy: { id: "asc" },
        take: ACCOUNT_DELETION_OUTBOX_BATCH_SIZE,
        select: { id: true, userId: true, s3Key: true, attempts: true },
      });
      if (entries.length === 0) return;
      cursor = entries[entries.length - 1].id;

      const purge = await this.photoPurge.purgeObjects(
        entries.map((entry) => entry.s3Key),
        { event: ALERT_EVENTS.ACCOUNT_PHOTOS_PURGED, ...("userId" in scope ? { userId: scope.userId } : {}) },
      );
      const failedKeys = new Set(purge.failedKeys);
      const failed = entries.filter((entry) => failedKeys.has(entry.s3Key));
      const settled = entries.filter((entry) => !failedKeys.has(entry.s3Key));

      await this.settle(settled, failed, result);
      if (entries.length < ACCOUNT_DELETION_OUTBOX_BATCH_SIZE) return;
    }
  }

  /**
   * Moves kept photos off keys that name their uploader. Per entry, and safe
   * to repeat at any point:
   *
   * 1. copy the original, then its derived copies, to the new key (a derived
   *    copy that was never rendered is skipped: the image processor renders
   *    the new original anyway, since it lands under photos/);
   * 2. point the row at the new key, only if it still has the old one, and
   *    move any report evidence that names the old key with it;
   * 3. delete the old original and its derived copies.
   *
   * The row only ever names an object that exists, so the photo stays
   * viewable throughout. A photo deleted meanwhile takes its copies with it.
   */
  private async drainRekeys(scope: OutboxScope, result: OutboxDrainResult): Promise<void> {
    const where = whereFor(AccountDeletionOutboxAction.REKEY, scope);
    let cursor: string | undefined;
    for (;;) {
      const entries = await this.prisma.accountDeletionOutbox.findMany({
        where: cursor ? { ...where, id: { gt: cursor } } : where,
        orderBy: { id: "asc" },
        take: ACCOUNT_DELETION_OUTBOX_BATCH_SIZE,
        select: { id: true, userId: true, s3Key: true, photoId: true, targetS3Key: true, attempts: true },
      });
      if (entries.length === 0) return;
      cursor = entries[entries.length - 1].id;

      const settled: typeof entries = [];
      const failed: typeof entries = [];
      for (const entry of entries) {
        try {
          await this.rekey(entry);
          settled.push(entry);
        } catch (error) {
          this.logger.warn(
            { err: error as Error, event: "user.account.photo_rekey_failed", photoId: entry.photoId },
            "Moving a kept photo off its uploader's key failed; the next drain retries",
          );
          failed.push(entry);
        }
      }
      await this.settle(settled, failed, result);
      if (entries.length < ACCOUNT_DELETION_OUTBOX_BATCH_SIZE) return;
    }
  }

  private async rekey(
    entry: { s3Key: string; photoId: string | null; targetS3Key: string | null },
    reread = false,
  ): Promise<void> {
    const { s3Key: from, photoId, targetS3Key: to } = entry;
    if (!photoId || !to) return;

    const photo = await this.prisma.photo.findUnique({ where: { id: photoId }, select: { s3Key: true } });
    if (!photo) {
      // Deleted meanwhile, by a path that purged the key it knew. A copy this
      // entry made before is nobody's: take it.
      await this.s3Service.deleteObjects(withPhotoDerivativeS3Keys([to]));
      return;
    }
    if (photo.s3Key === from) {
      await this.s3Service.copyObject(from, to);
      const fromCopies = buildPhotoDerivativeS3Keys(from);
      const toCopies = buildPhotoDerivativeS3Keys(to);
      for (const name of ["thumb", "large"] as const) {
        const head = await this.s3Service.headObject(fromCopies[name]);
        if (head.exists) await this.s3Service.copyObject(fromCopies[name], toCopies[name]);
      }

      let moved: number;
      try {
        moved = await this.prisma.$transaction(async (tx) => {
          const { count } = await tx.photo.updateMany({ where: { id: photoId, s3Key: from }, data: { s3Key: to } });
          if (count > 0) {
            // A report not yet copied to evidence names the object it will
            // copy; it follows the photo, so the old key is not needed after.
            await tx.reportEvidence.updateMany({ where: { objectS3Key: from }, data: { objectS3Key: to } });
          }
          return count;
        });
      } catch (error) {
        // Another row holds the new key, which only a UUID collision could
        // cause: leave this photo where it is rather than overwrite anything.
        if (!isUniqueConstraintViolation(error)) throw error;
        this.logger.error(
          { event: "user.account.photo_rekey_conflict", photoId, audit: true },
          "A kept photo's new key is already taken; it keeps its old key",
        );
        return;
      }
      // The row changed under us (deleted, or moved): look once more and
      // finish from what it says now.
      if (moved === 0) {
        if (reread) throw new Error(`Photo ${photoId} kept changing while it was moved`);
        return this.rekey(entry, true);
      }
    } else if (photo.s3Key !== to) {
      // Moved by something else: nothing of ours to finish.
      return;
    }

    const removed = await this.s3Service.deleteObjects(withPhotoDerivativeS3Keys([from]));
    if (removed.failed.some((failure) => failure.key === from)) {
      throw new Error(`S3 refused to delete the old key of photo ${photoId}`);
    }
  }

  /** Removes finished entries, counts a failure on the rest, and gives up on those past the bound. */
  private async settle(
    settled: { id: string }[],
    failed: { id: string; userId: string; attempts: number }[],
    result: OutboxDrainResult,
  ): Promise<void> {
    const exhausted = failed.filter((entry) => entry.attempts + 1 >= ACCOUNT_DELETION_OUTBOX_MAX_ATTEMPTS);
    const retried = failed.filter((entry) => entry.attempts + 1 < ACCOUNT_DELETION_OUTBOX_MAX_ATTEMPTS);

    const finished = [...settled, ...exhausted].map((entry) => entry.id);
    if (finished.length > 0) await this.prisma.accountDeletionOutbox.deleteMany({ where: { id: { in: finished } } });
    if (retried.length > 0) {
      await this.prisma.accountDeletionOutbox.updateMany({
        where: { id: { in: retried.map((entry) => entry.id) } },
        data: { attempts: { increment: 1 } },
      });
    }
    if (exhausted.length > 0) {
      this.logger.error(
        {
          event: ALERT_EVENTS.ACCOUNT_DELETION_OUTBOX_GIVEN_UP,
          entries: exhausted.length,
          userIds: [...new Set(exhausted.map((entry) => entry.userId))],
          audit: true,
        },
        "Account deletion objects that kept failing were left to the S3 orphan reconciler",
      );
    }

    result.done += settled.length;
    result.failed += retried.length;
    result.givenUp += exhausted.length;
  }
}

const whereFor = (action: AccountDeletionOutboxAction, scope: OutboxScope): Prisma.AccountDeletionOutboxWhereInput => ({
  action,
  ...("userId" in scope ? { userId: scope.userId } : { createdAt: { lt: scope.createdBefore } }),
});
