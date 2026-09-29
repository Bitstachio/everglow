-- Reports outlive their event (docs/moderation.md, "What happens on delete").

-- CreateEnum
CREATE TYPE "ReportClosedReason" AS ENUM ('PHOTO_REMOVED', 'MEMBER_REMOVED', 'DISMISSED', 'PHOTO_DELETED_BY_UPLOADER', 'PHOTO_DELETED_BY_ORGANIZER', 'ACCOUNT_DELETED', 'EVENT_DELETED');

-- A deleted event now sets eventId to null instead of deleting its reports.
ALTER TABLE "Report" DROP CONSTRAINT "Report_eventId_fkey";
ALTER TABLE "Report" ALTER COLUMN "eventId" DROP NOT NULL;
ALTER TABLE "Report" ADD CONSTRAINT "Report_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- The event's title, kept for when the event is gone. Every existing report
-- still has its event (they were deleted with it until now).
ALTER TABLE "Report" ADD COLUMN "eventTitle" VARCHAR(100);
UPDATE "Report" AS r SET "eventTitle" = e."title" FROM "Event" AS e WHERE e."id" = r."eventId";
ALTER TABLE "Report" ALTER COLUMN "eventTitle" SET NOT NULL;

-- How a report was closed. A dismissal can only have been an organizer's; an
-- earlier ACTIONED report could have been any of several paths, so it stays
-- null rather than guessed.
ALTER TABLE "Report" ADD COLUMN "closedReason" "ReportClosedReason";
UPDATE "Report" SET "closedReason" = 'DISMISSED' WHERE "status" = 'DISMISSED';

-- An OPEN report has not been closed, so it has no reason.
ALTER TABLE "Report" ADD CONSTRAINT "Report_open_has_no_closed_reason_check" CHECK ("status" <> 'OPEN' OR "closedReason" IS NULL);
