-- The lease of the account deletion saga pass that holds a row, so a request
-- and the reconciler never run the same deletion at once
-- (docs/account-deletion.md §4). Additive only.

-- AlterTable
ALTER TABLE "User" ADD COLUMN "deletionClaimedUntil" TIMESTAMP(3);
