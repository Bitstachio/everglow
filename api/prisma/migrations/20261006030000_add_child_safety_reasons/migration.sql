-- Report reasons only the platform handles: child safety, and intimate images
-- shared without consent (docs/moderation.md §2, §7). Postgres 12+ adds
-- several enum values in one transaction.
ALTER TYPE "ReportReason" ADD VALUE 'CHILD_SAFETY';
ALTER TYPE "ReportReason" ADD VALUE 'NON_CONSENSUAL_INTIMATE_IMAGE';

ALTER TYPE "ReportEscalation" ADD VALUE 'CHILD_SAFETY';
ALTER TYPE "ReportEscalation" ADD VALUE 'INTIMATE_IMAGE';

-- The CyberTipline or police reference, once the platform has reported it.
ALTER TABLE "Report" ADD COLUMN "authorityReference" TEXT;
