-- CreateEnum
CREATE TYPE "ReportTargetType" AS ENUM ('PHOTO', 'MEMBER');

-- CreateEnum
CREATE TYPE "ReportReason" AS ENUM ('SPAM', 'NUDITY_OR_SEXUAL', 'HARASSMENT', 'VIOLENCE', 'OTHER');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('OPEN', 'ACTIONED', 'DISMISSED');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "termsAcceptedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "Report" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "reporterId" UUID,
    "targetType" "ReportTargetType" NOT NULL,
    "photoId" UUID,
    "reportedUserId" UUID,
    "reason" "ReportReason" NOT NULL,
    "note" VARCHAR(500),
    "status" "ReportStatus" NOT NULL DEFAULT 'OPEN',
    "resolvedById" UUID,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserBlock" (
    "id" UUID NOT NULL,
    "blockerId" UUID NOT NULL,
    "blockedId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserBlock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Report_eventId_status_createdAt_idx" ON "Report"("eventId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Report_photoId_idx" ON "Report"("photoId");

-- CreateIndex
CREATE INDEX "Report_reporterId_idx" ON "Report"("reporterId");

-- CreateIndex
CREATE INDEX "Report_reportedUserId_idx" ON "Report"("reportedUserId");

-- CreateIndex
CREATE INDEX "Report_resolvedById_idx" ON "Report"("resolvedById");

-- CreateIndex
CREATE UNIQUE INDEX "Report_reporterId_photoId_key" ON "Report"("reporterId", "photoId") WHERE ("status" = 'OPEN');

-- CreateIndex
CREATE UNIQUE INDEX "Report_reporterId_eventId_reportedUserId_key" ON "Report"("reporterId", "eventId", "reportedUserId") WHERE ("status" = 'OPEN' AND "targetType" = 'MEMBER');

-- CreateIndex
CREATE INDEX "UserBlock_blockedId_idx" ON "UserBlock"("blockedId");

-- CreateIndex
CREATE UNIQUE INDEX "UserBlock_blockerId_blockedId_key" ON "UserBlock"("blockerId", "blockedId");

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_photoId_fkey" FOREIGN KEY ("photoId") REFERENCES "Photo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_reportedUserId_fkey" FOREIGN KEY ("reportedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBlock" ADD CONSTRAINT "UserBlock_blockerId_fkey" FOREIGN KEY ("blockerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBlock" ADD CONSTRAINT "UserBlock_blockedId_fkey" FOREIGN KEY ("blockedId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CHECK constraints Prisma's schema language cannot express. Each one is
-- written so a later ON DELETE SET NULL still passes: a comparison with NULL is
-- NULL, and a CHECK only rejects FALSE.

-- A MEMBER report points at a user, never at a photo.
ALTER TABLE "Report" ADD CONSTRAINT "Report_member_target_has_no_photo_check" CHECK ("targetType" = 'PHOTO' OR "photoId" IS NULL);

-- Nobody reports themselves or their own photo.
ALTER TABLE "Report" ADD CONSTRAINT "Report_reporter_is_not_reported_check" CHECK ("reporterId" <> "reportedUserId");

-- An OPEN report has no resolution; a resolved one has its timestamp. The
-- resolver may be NULL on a resolved report once that account is deleted.
ALTER TABLE "Report" ADD CONSTRAINT "Report_resolution_matches_status_check" CHECK (("status" = 'OPEN') = ("resolvedAt" IS NULL) AND ("status" <> 'OPEN' OR "resolvedById" IS NULL));

-- Nobody blocks themselves.
ALTER TABLE "UserBlock" ADD CONSTRAINT "UserBlock_no_self_block_check" CHECK ("blockerId" <> "blockedId");
