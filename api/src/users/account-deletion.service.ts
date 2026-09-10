import { Injectable } from "@nestjs/common";
import { AccessLevel, PhotoStatus, Prisma } from "generated/prisma/client";
import { PinoLogger } from "nestjs-pino";
import { PhotoPurgeService } from "src/photos/photo-purge.service";
import { isRecordNotFound } from "src/prisma/prisma.errors";
import { PrismaService } from "src/prisma/prisma.service";
import { hashProviderSub } from "./deleted-account";
import { ACCOUNT_DELETION_PHOTO_POLICIES, AccountDeletionPhotoPolicy } from "./users.constants";

export interface AccountDeletionSummary {
  /** Events the account organised alone with nobody else in them: deleted, photos included. */
  eventsDeleted: number;
  /** Events the account organised alone with other members: the longest-standing member is now an organizer. */
  eventsHandedOver: number;
  /** Memberships that went with the account, in events that survived it. */
  membershipsRemoved: number;
  /** READY photos left in surviving events with no uploader. */
  photosKept: number;
  /** READY photos removed from surviving events. */
  photosDeleted: number;
  /** PENDING upload slots discarded. */
  uploadsDiscarded: number;
}

type DeletionOutcome = AccountDeletionSummary & { s3Keys: string[] };

// A deletion that loses a race (a row it was reshaping vanished under it) is
// rolled back by Postgres and tried once more. The second run either finds
// the account already gone, which is the outcome that was asked for, or
// finishes the job.
const MAX_ATTEMPTS = 2;

// The transaction visits every event the account organises; keep room for an
// account with many of them rather than fail deletion for the busiest users.
const TRANSACTION_TIMEOUT_MS = 30_000;

/**
 * Deletes an account and settles everything it touched in one transaction,
 * then reclaims its S3 objects best effort. Always converges: a repeat call,
 * or a concurrent one, finds nothing left and reports success.
 *
 * docs/account-deletion.md records the rules applied here and the
 * alternatives that were considered.
 */
@Injectable()
export class AccountDeletionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly photoPurgeService: PhotoPurgeService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(this.constructor.name);
  }

  /** Returns what was done, or null when the account was already gone. */
  async deleteAccount(userId: string, photoPolicy: AccountDeletionPhotoPolicy): Promise<AccountDeletionSummary | null> {
    for (let attempt = 1; ; attempt += 1) {
      try {
        const outcome = await this.prisma.$transaction((tx) => this.deleteInTransaction(tx, userId, photoPolicy), {
          timeout: TRANSACTION_TIMEOUT_MS,
        });
        if (!outcome) return null;

        const { s3Keys, ...summary } = outcome;
        this.logger.info(
          { event: "user.account.deleted", userId, photoPolicy, ...summary, audit: true },
          "User account deleted",
        );
        // S3 only after the commit. The rows were the source of truth and are
        // gone, so what is at stake now is storage cost, which the daily
        // orphan reconciler also covers; the purge never fails the request.
        await this.photoPurgeService.purgeObjects(s3Keys, { event: "user.account.photos_purged", callerId: userId });
        return summary;
      } catch (error) {
        if (!isRecordNotFound(error) || attempt >= MAX_ATTEMPTS) throw error;
        this.logger.warn(
          { event: "user.account.deletion_retried", userId, attempt },
          "Account deletion lost a race with a concurrent change and is being retried",
        );
      }
    }
  }

  private async deleteInTransaction(
    tx: Prisma.TransactionClient,
    userId: string,
    photoPolicy: AccountDeletionPhotoPolicy,
  ): Promise<DeletionOutcome | null> {
    const user = await tx.user.findUnique({ where: { id: userId }, select: { id: true, providerSub: true } });
    if (!user) return null;

    const s3Keys: string[] = [];
    let eventsDeleted = 0;
    let eventsHandedOver = 0;

    // 1. Events the account organises. With another organizer around nothing
    //    needs doing: the membership goes with the row. Otherwise the event
    //    must not be left without anyone able to manage or delete it.
    const organized = await tx.eventAccess.findMany({
      where: { userId, accessLevel: AccessLevel.ORGANIZER },
      select: { eventId: true },
    });
    for (const { eventId } of organized) {
      const otherOrganizers = await tx.eventAccess.count({
        where: { eventId, accessLevel: AccessLevel.ORGANIZER, userId: { not: userId } },
      });
      if (otherOrganizers > 0) continue;

      // Participants before viewers (the enum is declared in that order), then
      // whoever has been a member longest. Deterministic, unlike a random pick.
      const successor = await tx.eventAccess.findFirst({
        where: { eventId, userId: { not: userId } },
        orderBy: [{ accessLevel: "asc" }, { createdAt: "asc" }],
        select: { id: true },
      });
      if (successor) {
        await tx.eventAccess.update({ where: { id: successor.id }, data: { accessLevel: AccessLevel.ORGANIZER } });
        eventsHandedOver += 1;
        continue;
      }

      // Nobody else is left. The event goes with every photo still in it,
      // including photos of members who left earlier.
      const photos = await tx.photo.findMany({ where: { eventId }, select: { s3Key: true } });
      s3Keys.push(...photos.map((photo) => photo.s3Key));
      await tx.event.delete({ where: { id: eventId } });
      eventsDeleted += 1;
    }
    const membershipsRemoved = await tx.eventAccess.count({ where: { userId } });

    // 2. Uploads in flight never became visible to anyone; they only hold
    //    quota and, at most, a half-written object.
    const pending = await tx.photo.findMany({
      where: { addedById: userId, status: PhotoStatus.PENDING },
      select: { s3Key: true },
    });
    if (pending.length > 0) {
      await tx.photo.deleteMany({ where: { addedById: userId, status: PhotoStatus.PENDING } });
      s3Keys.push(...pending.map((photo) => photo.s3Key));
    }

    // 3. READY photos in events that outlive the account.
    let photosKept = 0;
    let photosDeleted = 0;
    if (photoPolicy === ACCOUNT_DELETION_PHOTO_POLICIES.DELETE) {
      const ready = await tx.photo.findMany({ where: { addedById: userId }, select: { s3Key: true } });
      if (ready.length > 0) {
        await tx.photo.deleteMany({ where: { addedById: userId } });
        s3Keys.push(...ready.map((photo) => photo.s3Key));
      }
      photosDeleted = ready.length;
    } else {
      const { count } = await tx.photo.updateMany({ where: { addedById: userId }, data: { addedById: null } });
      photosKept = count;
    }

    // 4. The tombstone first, then the row. The upsert covers a subject that
    //    registered again after an earlier deletion and is now deleting again;
    //    the latest timestamp is the one that matters.
    const providerSubHash = hashProviderSub(user.providerSub);
    await tx.deletedAccount.upsert({
      where: { providerSubHash },
      create: { providerSubHash, userId },
      update: { userId, deletedAt: new Date() },
    });
    // Cascades take the profile and the remaining memberships; surviving
    // events keep their rows with creatorId set to null.
    await tx.user.delete({ where: { id: userId } });

    return {
      eventsDeleted,
      eventsHandedOver,
      membershipsRemoved,
      photosKept,
      photosDeleted,
      uploadsDiscarded: pending.length,
      s3Keys,
    };
  }
}
