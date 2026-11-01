import { Prisma, ReportStatus, ReportTargetType } from "generated/prisma/client";

/**
 * Ends an event's review once no report about the event itself is OPEN
 * (docs/moderation.md §4). The review exists because of those reports, so the
 * platform dismissing the last one leaves nothing for it to wait on. Run it
 * in the transaction that closed the report.
 *
 * Locks the event row first: a new event report takes a key-share lock on it
 * (the foreign key), so one filed concurrently either commits first and is
 * counted, or waits and finds the event no longer under review, where its own
 * threshold check decides again. Returns when the review had started, or null
 * when nothing was lifted.
 */
export const liftReviewWhenEventReportsSettled = async (
  tx: Prisma.TransactionClient,
  eventId: string,
): Promise<Date | null> => {
  const [event] = await tx.$queryRaw<{ underReviewAt: Date | null }[]>`
    SELECT "underReviewAt" FROM "Event" WHERE "id" = ${eventId}::uuid FOR UPDATE`;
  if (!event?.underReviewAt) return null;

  const open = await tx.report.count({
    where: { eventId, targetType: ReportTargetType.EVENT, status: ReportStatus.OPEN },
  });
  if (open > 0) return null;

  await tx.event.update({ where: { id: eventId }, data: { underReviewAt: null } });
  return event.underReviewAt;
};
