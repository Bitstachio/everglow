-- A report whose reporter an organizer or the platform removed from the
-- event closes as REPORTER_REMOVED and stops counting toward the photo hide
-- threshold (docs/moderation.md §3, §6). Additive.
ALTER TYPE "ReportClosedReason" ADD VALUE 'REPORTER_REMOVED';
