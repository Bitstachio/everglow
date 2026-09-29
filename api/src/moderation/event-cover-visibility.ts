import { AccessLevel, Prisma, ReportStatus, ReportTargetType } from "generated/prisma/client";
import { SEVERE_REPORT_REASONS } from "./moderation.constants";

/**
 * Which of these events' covers the viewer must not see, in one query each for
 * reports and organizer roles. The cover is hidden from a viewer who has an OPEN
 * report on the event (they asked not to see it), and from every non-organizer
 * while any OPEN report on the event is for nudity or violence. Organizers keep
 * seeing it, as they keep seeing reported photos. Title and description are
 * never hidden automatically (docs/moderation.md).
 */
export async function hiddenEventCoverIds(
  db: Prisma.TransactionClient,
  viewerId: string,
  eventIds: string[],
): Promise<Set<string>> {
  if (eventIds.length === 0) return new Set();

  const reports = await db.report.findMany({
    where: {
      eventId: { in: eventIds },
      targetType: ReportTargetType.EVENT,
      status: ReportStatus.OPEN,
      OR: [{ reporterId: viewerId }, { reason: { in: [...SEVERE_REPORT_REASONS] } }],
    },
    select: { eventId: true, reporterId: true },
  });
  // Every row matched eventId IN eventIds, so none is null.
  const withEvent = reports.flatMap((report) => (report.eventId ? [{ ...report, eventId: report.eventId }] : []));
  if (withEvent.length === 0) return new Set();

  const organizerOf = new Set(
    (
      await db.eventAccess.findMany({
        where: { userId: viewerId, eventId: { in: eventIds }, accessLevel: AccessLevel.ORGANIZER },
        select: { eventId: true },
      })
    ).map((access) => access.eventId),
  );

  // A row either is the viewer's own report or matched as severe.
  return new Set(
    withEvent
      .filter((report) => report.reporterId === viewerId || !organizerOf.has(report.eventId))
      .map((report) => report.eventId),
  );
}
