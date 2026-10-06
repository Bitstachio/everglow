-- Evidence of what each report was about, and holds that keep a report past
-- the retention window (docs/moderation.md §7).


-- CreateEnum
CREATE TYPE "ReportHoldReason" AS ENUM ('CHILD_SAFETY', 'INTIMATE_IMAGE', 'LAW_ENFORCEMENT', 'LEGAL');

-- AlterTable
ALTER TABLE "Report" ADD COLUMN     "holdReason" "ReportHoldReason",
ADD COLUMN     "holdUntil" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ReportEvidence" (
    "id" UUID NOT NULL,
    "reportId" UUID NOT NULL,
    "objectS3Key" TEXT,
    "contentType" TEXT,
    "sizeBytes" INTEGER,
    "evidenceS3Key" TEXT,
    "sha256" CHAR(64),
    "quarantinedAt" TIMESTAMP(3),
    "quarantineFailedAt" TIMESTAMP(3),
    "subjectUserId" UUID,
    "subjectUsername" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReportEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReportEvidence_reportId_key" ON "ReportEvidence"("reportId");

-- CreateIndex
CREATE UNIQUE INDEX "ReportEvidence_evidenceS3Key_key" ON "ReportEvidence"("evidenceS3Key");

-- CreateIndex
CREATE INDEX "ReportEvidence_objectS3Key_idx" ON "ReportEvidence"("objectS3Key");

-- CreateIndex
CREATE INDEX "ReportEvidence_quarantineFailedAt_idx" ON "ReportEvidence"("quarantineFailedAt");

-- CreateIndex
CREATE INDEX "Report_status_resolvedAt_idx" ON "Report"("status", "resolvedAt");

-- AddForeignKey
ALTER TABLE "ReportEvidence" ADD CONSTRAINT "ReportEvidence_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE CASCADE ON UPDATE CASCADE;
