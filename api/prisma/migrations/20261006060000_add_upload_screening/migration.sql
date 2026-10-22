-- Reports filed by upload screening, which have no reporter (docs/moderation.md §11).

-- CreateEnum
CREATE TYPE "ReportSource" AS ENUM ('USER', 'AUTOMATED');

-- AlterEnum
ALTER TYPE "ReportEscalation" ADD VALUE 'AUTOMATED_FLAG';

-- AlterTable
ALTER TABLE "Report" ADD COLUMN     "source" "ReportSource" NOT NULL DEFAULT 'USER';

-- One OPEN automated report per photo.
CREATE UNIQUE INDEX "Report_photoId_key" ON "Report"("photoId") WHERE ("status" = 'OPEN' AND "source" = 'AUTOMATED');
