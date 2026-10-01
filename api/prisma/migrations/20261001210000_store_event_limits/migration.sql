-- Each event carries its own limits (docs/event-quotas.md, "How it's built"),
-- copied from its plan when it is created or upgraded. Every existing event
-- is FREE, so the defaults (30 members, 3 GB) backfill them.

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "memberLimit" INTEGER DEFAULT 30,
ADD COLUMN     "storageLimitBytes" BIGINT DEFAULT 3221225472;
