-- The personal storage quota is gone: each gallery's storage is limited by
-- its event's plan (docs/event-quotas.md), and nothing reads this column.
ALTER TABLE "User" DROP COLUMN "storageLimitBytes";
