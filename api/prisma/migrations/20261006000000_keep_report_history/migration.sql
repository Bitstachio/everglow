-- Reports outlive their event, and record why and in which capacity each one
-- closed (docs/moderation.md §1, §3).

-- CreateEnum
CREATE TYPE "ReportClosedReason" AS ENUM ('PHOTO_REMOVED', 'MEMBER_REMOVED', 'ACCOUNT_SUSPENDED', 'EVENT_SUSPENDED', 'EVENT_DELETED', 'DISMISSED', 'PHOTO_DELETED', 'ACCOUNT_DELETED');

-- CreateEnum
CREATE TYPE "ReportActorRole" AS ENUM ('ORGANIZER', 'PLATFORM', 'SUBJECT', 'SYSTEM');

-- AlterEnum
ALTER TYPE "ReportStatus" ADD VALUE 'TARGET_GONE';

-- An event's reports no longer go with it: eventId becomes SET NULL.
ALTER TABLE "Report" DROP CONSTRAINT "Report_eventId_fkey";
ALTER TABLE "Report" ALTER COLUMN "eventId" DROP NOT NULL;
ALTER TABLE "Report" ADD CONSTRAINT "Report_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- The event's title, copied from the event for existing rows.
ALTER TABLE "Report" ADD COLUMN "eventTitle" VARCHAR(100);
UPDATE "Report" AS r SET "eventTitle" = e."title" FROM "Event" AS e WHERE e."id" = r."eventId";
ALTER TABLE "Report" ALTER COLUMN "eventTitle" SET NOT NULL;

-- Why and in which capacity a report closed. Only a dismissal can be told
-- apart in existing rows: an ACTIONED one may have been an organizer's
-- verdict or a photo deleted by anyone, so it keeps neither.
ALTER TABLE "Report" ADD COLUMN "closedReason" "ReportClosedReason",
ADD COLUMN "closedByRole" "ReportActorRole";
UPDATE "Report" SET "closedReason" = 'DISMISSED', "closedByRole" = 'ORGANIZER' WHERE "status" = 'DISMISSED';

-- An OPEN report has neither; a closed one has both or, from before these
-- columns, neither.
ALTER TABLE "Report" ADD CONSTRAINT "Report_closure_matches_status_check" CHECK (
  ("closedReason" IS NULL) = ("closedByRole" IS NULL)
  AND ("status" <> 'OPEN' OR "closedReason" IS NULL)
);
