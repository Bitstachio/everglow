-- Reports about an event itself (cover, title, description). On its own
-- migration: Postgres does not allow a new enum value to be used in the same
-- transaction that adds it, and the next migration's index uses it.
ALTER TYPE "ReportTargetType" ADD VALUE 'EVENT';
