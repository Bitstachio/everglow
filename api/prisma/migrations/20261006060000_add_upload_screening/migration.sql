-- Reports filed by upload screening, which have no reporter (docs/moderation.md §11).

-- CreateEnum
CREATE TYPE "ReportSource" AS ENUM ('USER', 'AUTOMATED');

-- AlterEnum
ALTER TYPE "ReportEscalation" ADD VALUE 'AUTOMATED_FLAG';

-- AlterTable
ALTER TABLE "Report" ADD COLUMN     "source" "ReportSource" NOT NULL DEFAULT 'USER';
