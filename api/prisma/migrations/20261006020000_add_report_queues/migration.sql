-- Every report is handled by the event's organizers or by the platform
-- (docs/moderation.md §3).

-- CreateEnum
CREATE TYPE "ReportQueue" AS ENUM ('ORGANIZERS', 'PLATFORM');

-- CreateEnum
CREATE TYPE "ReportEscalation" AS ENUM ('SEVERE_REASON', 'TARGET_IS_ORGANIZER', 'TARGET_IS_SOLE_ORGANIZER', 'TARGET_IS_EVENT', 'HIDE_THRESHOLD_REACHED', 'EVENT_UNDER_REVIEW', 'ORGANIZER_TIMEOUT', 'GALLERY_CLOSED', 'SEVERE_DISMISSED', 'TARGET_DELETED');

-- AlterTable
ALTER TABLE "Report" ADD COLUMN     "escalatedAt" TIMESTAMP(3),
ADD COLUMN     "escalationReasons" "ReportEscalation"[] DEFAULT ARRAY[]::"ReportEscalation"[],
ADD COLUMN     "overdueAlertedAt" TIMESTAMP(3),
ADD COLUMN     "queue" "ReportQueue" NOT NULL DEFAULT 'ORGANIZERS';

-- CreateIndex
CREATE INDEX "Report_queue_status_escalatedAt_idx" ON "Report"("queue", "status", "escalatedAt");

-- Open reports that already belong with the platform move there now: reports
-- about the event itself, about one of its organizers, and any in a gallery
-- that has closed. Closed reports keep ORGANIZERS; nobody handles them again.
UPDATE "Report" SET "queue" = 'PLATFORM', "escalatedAt" = (now() AT TIME ZONE 'UTC'),
  "escalationReasons" = ARRAY['TARGET_IS_EVENT']::"ReportEscalation"[]
WHERE "status" = 'OPEN' AND "targetType" = 'EVENT';

UPDATE "Report" AS r SET "queue" = 'PLATFORM', "escalatedAt" = (now() AT TIME ZONE 'UTC'),
  "escalationReasons" = array_append(r."escalationReasons", 'TARGET_IS_ORGANIZER')
FROM "EventAccess" AS a
WHERE r."status" = 'OPEN' AND r."queue" = 'ORGANIZERS'
  AND a."eventId" = r."eventId" AND a."userId" = r."reportedUserId" AND a."accessLevel" = 'ORGANIZER';

UPDATE "Report" AS r SET "queue" = 'PLATFORM', "escalatedAt" = (now() AT TIME ZONE 'UTC'),
  "escalationReasons" = array_append(r."escalationReasons", 'GALLERY_CLOSED')
FROM "Event" AS e
WHERE r."status" = 'OPEN' AND r."queue" = 'ORGANIZERS'
  AND e."id" = r."eventId" AND e."galleryClosesAt" IS NOT NULL AND e."galleryClosesAt" <= now();
