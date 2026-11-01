-- Additive: the TAKE IT DOWN removal deadline and its two alerts, and the
-- date a report went to NCMEC or the police (docs/moderation.md §7, §9).
-- AlterTable
ALTER TABLE "Report" ADD COLUMN     "authorityReportedAt" TIMESTAMP(3),
ADD COLUMN     "removalDueAt" TIMESTAMP(3),
ADD COLUMN     "removalDueSoonAlertedAt" TIMESTAMP(3),
ADD COLUMN     "removalOverdueAlertedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Report_removalDueAt_idx" ON "Report"("removalDueAt");

-- Intimate-image reports filed before this column existed get their deadline
-- too, so the hourly check announces any still OPEN past it.
UPDATE "Report"
SET "removalDueAt" = "createdAt" + INTERVAL '48 hours'
WHERE "reason" = 'NON_CONSENSUAL_INTIMATE_IMAGE';
