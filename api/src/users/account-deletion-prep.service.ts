import { Injectable } from "@nestjs/common";
import {
  AccessLevel,
  AccountDeletionPhotoPolicy,
  PhotoStatus,
  Prisma,
  ReportActorRole,
  ReportEscalation,
} from "generated/prisma/client";
import { PinoLogger } from "nestjs-pino";
import { lockPendingModeration } from "src/moderation/pending-moderation";
import { EscalatedReport, escalateToPlatform, logEscalations } from "src/moderation/report-escalation";
import { closeMemberReportsOnDeletedAccount, closeReportsOnDeletedPhotos } from "src/moderation/report-closure";
import { PrismaService } from "src/prisma/prisma.service";
import { AccountDeletionOutboxService } from "./account-deletion-outbox.service";
import { AccountDeletionEventOutcome } from "./users.constants";

export interface AccountDeletionPrepSummary {
  /** Events the account organised alone with nobody else in them: deleted, photos and cover included. */
  eventsDeleted: number;
  /** Events the account organised alone with other members: the longest-standing member is now an organizer. */
  eventsHandedOver: number;
  /**
   * Events the account organised alone with nobody else in them, kept because
   * they are under review or have OPEN reports: they stay without members for
   * the platform to decide.
   */
  eventsKeptForModeration: number;
  /** READY photos left in surviving events with no uploader. */
  photosKept: number;
  /** READY photos removed from surviving events. */
  photosDeleted: number;
  /** OPEN reports on those photos, closed as TARGET_GONE because the photo is gone. */
  reportsClosed: number;
  /** OPEN member reports about the account that aren't severe, closed as TARGET_GONE. */
  memberReportsClosed: number;
  /** Severe reports about the account or its deleted photos, moved to the platform instead of closing. */
  reportsEscalated: number;
  /** PENDING upload slots discarded. */
  uploadsDiscarded: number;
  /** Whether the profile had an avatar whose object is queued for the purge. */
  avatarQueued: boolean;
}

/** What prep does to an event the account organizes alone (docs/account-deletion.md §6a). */
export type OrganizedEventOutcome = AccountDeletionEventOutcome;

export interface OrganizedEventFate {
  eventId: string;
  title: string;
  outcome: OrganizedEventOutcome;
}

export interface AccountDeletionPrepResult {
  summary: AccountDeletionPrepSummary;
  /**
   * The events the account organizes alone and what happened to each. Events
   * with another organizer are untouched and not listed.
   */
  events: OrganizedEventFate[];
}

/** Carries a dry run's result out of the transaction it rolls back. */
class DryRun extends Error {
  constructor(readonly result: AccountDeletionPrepResult) {
    super("Account deletion preview: rolled back on purpose");
    this.name = "DryRun";
  }
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
    private readonly outbox: AccountDeletionOutboxService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(this.constructor.name);
  }

  async prepareRelatedData(
    userId: string,
    photoPolicy: AccountDeletionPhotoPolicy,
  ): Promise<AccountDeletionPrepResult> {
    const { escalated, promoted, ...result } = await this.prisma.$transaction(
      (tx) => this.prepareInTransaction(tx, userId, photoPolicy),
      { timeout: TRANSACTION_TIMEOUT_MS },
    );
    logEscalations(this.logger, escalated, ReportEscalation.TARGET_DELETED, { userId });
    logEscalations(this.logger, promoted, ReportEscalation.TARGET_IS_ORGANIZER, { userId });

    this.logger.info(
      { event: "user.account.deletion_prepared", userId, photoPolicy, ...result.summary, audit: true },
      "Account deletion prep finished",
    );

    return result;
  }

  /**
   * What prep would do to each event the account organizes alone, if it ran
   * now with `photoPolicy`: the same code, in a transaction that is rolled
   * back. The delete screen shows it, so its labels are prep's real outcome
   * rather than a guess from the member count (an event under review, or one
   * whose open reports outlive the account, is kept, not deleted).
   */
  async preview(userId: string, photoPolicy: AccountDeletionPhotoPolicy): Promise<OrganizedEventFate[]> {
    try {
      await this.prisma.$transaction(
        async (tx) => {
          const { summary, events } = await this.prepareInTransaction(tx, userId, photoPolicy);
          throw new DryRun({ summary, events });
        },
        { timeout: TRANSACTION_TIMEOUT_MS },
      );
    } catch (error) {
      if (error instanceof DryRun) return error.result.events;
      throw error;
    }
    // The transaction always throws; this is unreachable.
    return [];
  }

  private async prepareInTransaction(
    tx: Prisma.TransactionClient,
    userId: string,
    photoPolicy: AccountDeletionPhotoPolicy,
  ): Promise<AccountDeletionPrepResult & { escalated: EscalatedReport[]; promoted: EscalatedReport[] }> {
    const s3Keys: string[] = [];
    let eventsDeleted = 0;
    let eventsHandedOver = 0;
    const keptForModeration: string[] = [];
    const promoted: EscalatedReport[] = [];
    const fates = new Map<string, OrganizedEventFate>();

    // 1. Events the account organises. With another organizer around nothing
    //    needs doing: the membership cascades with the row. Otherwise the
    //    event must not be left without anyone able to manage or delete it.
    const organized = await tx.eventAccess.findMany({
      where: { userId, accessLevel: AccessLevel.ORGANIZER },
      select: { eventId: true, event: { select: { title: true } } },
    });
    for (const { eventId, event } of organized) {
      const fate = (outcome: OrganizedEventOutcome) =>
        fates.set(eventId, { eventId, title: event?.title ?? "", outcome });
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
        const access = await tx.eventAccess.update({
          where: { id: successor.id },
          data: { accessLevel: AccessLevel.ORGANIZER },
          select: { userId: true },
        });
        // As for any promotion: an organizer can't judge reports about
        // themselves, so theirs go to the platform (docs/moderation.md §3).
        const reports = await tx.report.findMany({
          where: { eventId, reportedUserId: access.userId, status: "OPEN", queue: "ORGANIZERS" },
          select: { id: true },
        });
        promoted.push(
          ...(await escalateToPlatform(
            tx,
            reports.map((report) => report.id),
            ReportEscalation.TARGET_IS_ORGANIZER,
          )),
        );
        eventsHandedOver += 1;
        fate("HANDED_OVER");
        continue;
      }

      // Nobody is left who would keep it. If moderation still needs it, it
      // stays without members for the platform, which deletes it once it has
      // decided (docs/moderation.md §7). The account's own photos in it follow
      // the photo policy below, like any event that outlives the account.
      if (await lockPendingModeration(tx, eventId)) {
        keptForModeration.push(eventId);
        fate("KEPT_FOR_REVIEW");
        continue;
      }

      eventsDeleted += await this.deleteAbandonedEvent(tx, eventId, s3Keys);
      fate("DELETED");
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
    let reportsClosed = 0;
    const escalated: EscalatedReport[] = [];
    if (photoPolicy === AccountDeletionPhotoPolicy.DELETE) {
      const ready = await tx.photo.findMany({ where: { addedById: userId }, select: { id: true, s3Key: true } });
      if (ready.length > 0) {
        const reports = await closeReportsOnDeletedPhotos(
          tx,
          ready.map((photo) => photo.id),
          { id: userId, role: ReportActorRole.SUBJECT },
        );
        reportsClosed = reports.closed;
        escalated.push(...reports.escalated);
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

    // 4. Member reports about the account: there is nobody left to remove.
    //    Severe ones stay OPEN for the platform (docs/moderation.md §3).
    const memberReports = await closeMemberReportsOnDeletedAccount(tx, userId);
    escalated.push(...memberReports.escalated);

    // Settling the account's reports may have closed the very ones that kept
    // an event above: one with nothing left pending goes now, rather than
    // staying without members forever.
    let eventsKeptForModeration = 0;
    for (const eventId of keptForModeration) {
      if (await lockPendingModeration(tx, eventId)) {
        eventsKeptForModeration += 1;
        continue;
      }
      eventsDeleted += await this.deleteAbandonedEvent(tx, eventId, s3Keys);
      const kept = fates.get(eventId);
      if (kept) fates.set(eventId, { ...kept, outcome: "DELETED" });
    }

    // 5. The avatar. Its column cascades with the user row, so only the object
    //    needs collecting; the row is left alone, which keeps a resumed saga
    //    finding the same key again.
    const profile = await tx.userDetails.findUnique({ where: { userId }, select: { avatarS3Key: true } });
    const avatarS3Key = profile?.avatarS3Key ?? null;
    if (avatarS3Key) s3Keys.push(avatarS3Key);

    // 6. Every object collected above, queued in this transaction: the rows
    //    that pointed at them are gone the moment it commits, and nothing else
    //    would remember them if the saga failed before purging.
    await this.outbox.enqueuePurge(tx, userId, s3Keys);

    return {
      summary: {
        eventsDeleted,
        eventsHandedOver,
        eventsKeptForModeration,
        photosKept,
        photosDeleted,
        reportsClosed,
        memberReportsClosed: memberReports.closed,
        reportsEscalated: escalated.length,
        uploadsDiscarded: pending.length,
        avatarQueued: avatarS3Key !== null,
      },
      events: [...fates.values()],
      escalated,
      promoted,
    };
  }

  /**
   * Deletes an event nobody is left in, with every photo still in it,
   * including photos of members who left earlier, and collects their keys and
   * the cover's for the purge. Returns how many rows went.
   */
  private async deleteAbandonedEvent(tx: Prisma.TransactionClient, eventId: string, s3Keys: string[]): Promise<number> {
    const photos = await tx.photo.findMany({ where: { eventId }, select: { s3Key: true } });
    s3Keys.push(...photos.map((photo) => photo.s3Key));
    // Its cover goes to the same purge; the column disappears with the row.
    const event = await tx.event.findUnique({ where: { id: eventId }, select: { coverS3Key: true } });
    if (event?.coverS3Key) s3Keys.push(event.coverS3Key);
    // deleteMany, not delete: a concurrent deletion of the last other member
    // may have removed this event already, and that is the outcome we wanted.
    const { count } = await tx.event.deleteMany({ where: { id: eventId } });
    return count;
  }
}
