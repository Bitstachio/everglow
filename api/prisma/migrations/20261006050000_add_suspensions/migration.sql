-- Accounts and events the platform suspends (docs/moderation.md §8).

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "suspendedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "User" ADD COLUMN "suspendedAt" TIMESTAMP(3);
