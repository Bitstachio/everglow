import { Prisma, ReportStatus } from "generated/prisma/client";

/** Why an event must stay until the platform or its organizers have decided. */
export type PendingModeration = "EVENT_UNDER_REVIEW" | "EVENT_HAS_OPEN_REPORTS";

/**
 * Locks the event row and says whether moderation still needs it: it is under
 * review, or any report about it, its photos or its members is OPEN
 * (docs/moderation.md §7). Null when it may go.
 *
 * Call it inside the transaction that deletes the event, before the delete.
 * Filing a report takes a key-share lock on the event row (the foreign key),
 * which conflicts with this one: a report filed in between either commits
 * first and is counted, or waits until the delete has decided.
 */
export const lockPendingModeration = async (
  tx: Prisma.TransactionClient,
  eventId: string,
): Promise<PendingModeration | null> => {
  const [event] = await tx.$queryRaw<{ underReviewAt: Date | null }[]>`
    SELECT "underReviewAt" FROM "Event" WHERE "id" = ${eventId}::uuid FOR UPDATE`;
  if (!event) return null;
  if (event.underReviewAt) return "EVENT_UNDER_REVIEW";

  const openReports = await tx.report.count({ where: { eventId, status: ReportStatus.OPEN } });
  return openReports > 0 ? "EVENT_HAS_OPEN_REPORTS" : null;
};
