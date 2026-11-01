import {
  Prisma,
  ReportActorRole,
  ReportClosedReason,
  ReportEscalation,
  ReportQueue,
  ReportStatus,
} from "generated/prisma/client";
import { SEVERE_REPORT_REASONS } from "src/moderation/moderation.constants";
import { EscalatedReport, escalateToPlatform } from "src/moderation/report-escalation";
import { deleteUploadsInTransaction } from "src/photos/photo-deletion";

/**
 * What happens to a departing member's photos in the event: chosen by the
 * organizer who removes them, or by the member who leaves.
 */
export const MEMBER_PHOTOS = {
  /** They stay in the event, still credited to the member and counted against their storage; they can delete them later. */
  KEEP: "KEEP",
  /** Everything the member uploaded to the event is deleted. */
  DELETE: "DELETE",
} as const;
export type MemberPhotos = (typeof MEMBER_PHOTOS)[keyof typeof MEMBER_PHOTOS];

export interface RemoveMemberInput {
  eventId: string;
  userId: string;
  /** The organizer removing them: recorded on the ban, and as the resolver of any reports it closes. */
  removedById: string;
  /** Whether an organizer or the platform removes them: how the reports on their deleted photos close. */
  removedByRole: typeof ReportActorRole.ORGANIZER | typeof ReportActorRole.PLATFORM;
  photos: MemberPhotos;
  /** Photos the caller deletes itself, e.g. the one a report is about. */
  excludePhotoIds?: string[];
}

export interface RemovedMember {
  /** Objects to purge once the transaction has committed. */
  photoKeys: string[];
  photosDeleted: number;
  reportsClosed: number;
  /** Reports on their deleted photos that moved to the platform; the caller logs them. */
  reportsEscalated: EscalatedReport[];
  /** Reports they filed in the event that closed as REPORTER_REMOVED. */
  filedReportsClosed: number;
  /** Severe reports they filed in the event, moved to the platform instead (SEVERE_DISMISSED); the caller logs them. */
  filedReportsEscalated: EscalatedReport[];
}

/**
 * What happens to the OPEN reports a removed member filed in the event, while
 * they are still with the organizers (docs/moderation.md §6): removing the
 * reporter is a judgment that their reports there no longer count, so they
 * close as DISMISSED, REPORTER_REMOVED and stop counting toward the photo
 * hide threshold. A severe one is treated as a dismissal of it would be: it
 * moves to the platform instead (SEVERE_DISMISSED), and what it hides stays
 * hidden until the platform has looked. Reports already with the platform are
 * left alone.
 */
const settleReportsFiledBy = async (
  tx: Prisma.TransactionClient,
  { eventId, userId, removedById, removedByRole }: RemoveMemberInput,
): Promise<{ closed: number; escalated: EscalatedReport[] }> => {
  const filed = { eventId, reporterId: userId, status: ReportStatus.OPEN, queue: ReportQueue.ORGANIZERS };

  const severe = await tx.report.findMany({
    where: { ...filed, reason: { in: [...SEVERE_REPORT_REASONS] } },
    select: { id: true },
  });
  const escalated = await escalateToPlatform(
    tx,
    severe.map((report) => report.id),
    ReportEscalation.SEVERE_DISMISSED,
  );

  const { count } = await tx.report.updateMany({
    where: { ...filed, reason: { notIn: [...SEVERE_REPORT_REASONS] } },
    data: {
      status: ReportStatus.DISMISSED,
      closedReason: ReportClosedReason.REPORTER_REMOVED,
      closedByRole: removedByRole,
      resolvedById: removedById,
      resolvedAt: new Date(),
    },
  });

  return { closed: count, escalated };
};

/**
 * An organizer removing a member, by either route: the participant endpoint
 * or REMOVE_MEMBER on a report. Run it inside the caller's transaction. It
 * deletes the membership, bans them from rejoining through the invitation
 * link (a repeat ban keeps the first), settles the OPEN reports they filed
 * in the event (settleReportsFiledBy), and with DELETE removes every photo
 * they uploaded to the event, closing those photos' OPEN reports first
 * because their photoId is SET NULL with the row. Objects are the caller's to
 * purge after the commit, never inside a database transaction.
 *
 * A plain helper rather than a service method: ReportsService needs it, and
 * ModerationModule cannot import EventsModule without a cycle.
 */
export const removeMemberInTransaction = async (
  tx: Prisma.TransactionClient,
  input: RemoveMemberInput,
): Promise<RemovedMember> => {
  const { eventId, userId, removedById, removedByRole, photos, excludePhotoIds = [] } = input;
  await tx.eventAccess.deleteMany({ where: { eventId, userId } });
  await tx.eventBan.upsert({
    where: { eventId_userId: { eventId, userId } },
    create: { eventId, userId, bannedById: removedById },
    update: {},
  });
  const filed = await settleReportsFiledBy(tx, input);
  const filedReports = { filedReportsClosed: filed.closed, filedReportsEscalated: filed.escalated };

  if (photos === MEMBER_PHOTOS.KEEP) {
    return { photoKeys: [], photosDeleted: 0, reportsClosed: 0, reportsEscalated: [], ...filedReports };
  }

  const deleted = await deleteUploadsInTransaction(tx, {
    eventId,
    userId,
    closedBy: { id: removedById, role: removedByRole },
    excludePhotoIds,
  });
  return {
    photoKeys: deleted.photoKeys,
    photosDeleted: deleted.photosDeleted,
    reportsClosed: deleted.reportsClosed,
    reportsEscalated: deleted.reportsEscalated,
    ...filedReports,
  };
};
