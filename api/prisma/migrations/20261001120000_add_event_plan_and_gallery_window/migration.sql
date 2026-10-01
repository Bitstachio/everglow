-- Every event gets a plan and a gallery close time (docs/event-quotas.md).

-- CreateEnum
CREATE TYPE "EventPlan" AS ENUM ('FREE');

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "galleryClosedAt" TIMESTAMP(3),
ADD COLUMN     "galleryClosesAt" TIMESTAMP(3),
ADD COLUMN     "plan" "EventPlan" NOT NULL DEFAULT 'FREE';

-- Existing events are all FREE. Their galleries close 30 days (the FREE
-- window) after their date, but never sooner than 30 days from now, so no
-- gallery closes the moment this ships and every member gets the full window
-- to download.
UPDATE "Event" SET "galleryClosesAt" = GREATEST("date", NOW()) + INTERVAL '30 days';
