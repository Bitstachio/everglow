import { Injectable } from "@nestjs/common";
import { AccessLevel, AccountDeletionPhotoPolicy, PhotoStatus, Prisma } from "generated/prisma/client";
import { PinoLogger } from "nestjs-pino";
import { PrismaService } from "src/prisma/prisma.service";

export interface AccountDeletionPrepSummary {
  /** Events the account organised alone with nobody else in them: deleted, photos included. */
  eventsDeleted: number;
  /** Events the account organised alone with other members: the longest-standing member is now an organizer. */
  eventsHandedOver: number;
  /** READY photos left in surviving events with no uploader. */
  photosKept: number;
  /** READY photos removed from surviving events. */
  photosDeleted: number;
  /** PENDING upload slots discarded. */
  uploadsDiscarded: number;
  /** Whether the profile had an avatar whose object is queued for the purge. */
  avatarQueued: boolean;
}

export interface AccountDeletionPrepResult {
  summary: AccountDeletionPrepSummary;
  /** S3 objects the caller should purge once the user row is gone. */
  s3Keys: string[];
}

// Prep visits every event the account organises; leave room for the busiest
// accounts rather than fail a deletion on a transaction timeout.
const TRANSACTION_TIMEOUT_MS = 30_000;

/**
 * Step 3 of the account-deletion saga (docs/account-deletion.md): settle
 * everything the account owns so the `User` row can go, and so no event is
 * left without an organizer.
 *
 * Runs before the Auth0 call on purpose. The Auth0 delete cannot be undone,
 * so nothing irreversible happens until the application data is in a state
 * that can actually be torn down.
 *
 * Idempotent: the reconciler re-runs it, and a second pass finds the events
 * already handed over and the photos already settled.
 *
 * Accounts whose own deletion has started are invisible to the organizer rules
 * below. Without that, two members of one event deleting at the same time
 * leave it with no organizer at all: each one counts the other as cover, or
 * promotes someone who is themselves on the way out. The deletion flag is
 * stamped before prep runs, so by the time a prep transaction looks at a
 * candidate, a concurrent deletion of that candidate is already visible.
 */
@Injectable()
export class AccountDeletionPrepService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(this.constructor.name);
  }

  async prepareRelatedData(
    userId: string,
    photoPolicy: AccountDeletionPhotoPolicy,
  ): Promise<AccountDeletionPrepResult> {
    const result = await this.prisma.$transaction((tx) => this.prepareInTransaction(tx, userId, photoPolicy), {
      timeout: TRANSACTION_TIMEOUT_MS,
    });

    this.logger.info(
      { event: "user.account.deletion_prepared", userId, photoPolicy, ...result.summary, audit: true },
      "Account deletion prep finished",
    );

    return result;
  }

  private async prepareInTransaction(
    tx: Prisma.TransactionClient,
    userId: string,
    photoPolicy: AccountDeletionPhotoPolicy,
  ): Promise<AccountDeletionPrepResult> {
    const s3Keys: string[] = [];
    let eventsDeleted = 0;
    let eventsHandedOver = 0;

    // 1. Events the account organises. With another organizer around nothing
    //    needs doing: the membership cascades with the row. Otherwise the
    //    event must not be left without anyone able to manage or delete it.
    const organized = await tx.eventAccess.findMany({
      where: { userId, accessLevel: AccessLevel.ORGANIZER },
      select: { eventId: true },
    });
    for (const { eventId } of organized) {
      // Another organizer only counts as cover if they are staying.
      const otherOrganizers = await tx.eventAccess.count({
        where: {
          eventId,
          accessLevel: AccessLevel.ORGANIZER,
          userId: { not: userId },
          user: { deletionStartedAt: null },
        },
      });
      if (otherOrganizers > 0) continue;

      // Participants before viewers (the enum is declared in that order), then
      // whoever has been a member longest. Deterministic, unlike a random pick.
      // Members on their way out are skipped: handing the event to one of them
      // would lose it again when their own deletion finishes.
      const successor = await tx.eventAccess.findFirst({
        where: { eventId, userId: { not: userId }, user: { deletionStartedAt: null } },
        orderBy: [{ accessLevel: "asc" }, { createdAt: "asc" }],
        select: { id: true },
      });
      if (successor) {
        await tx.eventAccess.update({ where: { id: successor.id }, data: { accessLevel: AccessLevel.ORGANIZER } });
        eventsHandedOver += 1;
        continue;
      }

      // Nobody is left who would keep it. The event goes with every photo
      // still in it, including photos of members who left earlier.
      const photos = await tx.photo.findMany({ where: { eventId }, select: { s3Key: true } });
      s3Keys.push(...photos.map((photo) => photo.s3Key));
      // deleteMany, not delete: a concurrent deletion of the last other member
      // may have removed this event already, and that is the outcome we wanted.
      const { count } = await tx.event.deleteMany({ where: { id: eventId } });
      eventsDeleted += count;
    }

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

    // 3. READY photos in the events that outlive the account.
    let photosKept = 0;
    let photosDeleted = 0;
    if (photoPolicy === AccountDeletionPhotoPolicy.DELETE) {
      const ready = await tx.photo.findMany({ where: { addedById: userId }, select: { s3Key: true } });
      if (ready.length > 0) {
        await tx.photo.deleteMany({ where: { addedById: userId } });
        s3Keys.push(...ready.map((photo) => photo.s3Key));
      }
      photosDeleted = ready.length;
    } else {
      // Photo.addedById is SET NULL, so the row would survive the user anyway;
      // doing it here makes the outcome explicit and countable.
      const { count } = await tx.photo.updateMany({ where: { addedById: userId }, data: { addedById: null } });
      photosKept = count;
    }

    // 4. The avatar. Its column cascades with the user row, so only the object
    //    needs collecting; the row is left alone, which keeps a resumed saga
    //    finding the same key again.
    const profile = await tx.userDetails.findUnique({ where: { userId }, select: { avatarS3Key: true } });
    const avatarS3Key = profile?.avatarS3Key ?? null;
    if (avatarS3Key) s3Keys.push(avatarS3Key);

    return {
      summary: {
        eventsDeleted,
        eventsHandedOver,
        photosKept,
        photosDeleted,
        uploadsDiscarded: pending.length,
        avatarQueued: avatarS3Key !== null,
      },
      s3Keys,
    };
  }
}
