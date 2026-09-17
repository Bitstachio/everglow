-- CreateEnum
CREATE TYPE "AccountDeletionPhotoPolicy" AS ENUM ('KEEP', 'DELETE');

-- DropForeignKey
ALTER TABLE "Event" DROP CONSTRAINT "Event_creatorId_fkey";

-- DropForeignKey
ALTER TABLE "EventAccess" DROP CONSTRAINT "EventAccess_userId_fkey";

-- DropForeignKey
ALTER TABLE "Photo" DROP CONSTRAINT "Photo_addedById_fkey";

-- AlterTable: hash the tombstone key in place, so rows written by the plaintext
-- version are carried over instead of dropped. sha256() is built in since PG 11.
ALTER TABLE "DeletedProviderSub" DROP CONSTRAINT "DeletedProviderSub_pkey";
ALTER TABLE "DeletedProviderSub" ADD COLUMN "providerSubHash" VARCHAR(64);
UPDATE "DeletedProviderSub" SET "providerSubHash" = encode(sha256("providerSub"::bytea), 'hex');
ALTER TABLE "DeletedProviderSub" ALTER COLUMN "providerSubHash" SET NOT NULL;
ALTER TABLE "DeletedProviderSub" DROP COLUMN "providerSub";
ALTER TABLE "DeletedProviderSub" ADD CONSTRAINT "DeletedProviderSub_pkey" PRIMARY KEY ("providerSubHash");

-- AlterTable
ALTER TABLE "Event" ALTER COLUMN "creatorId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Photo" ALTER COLUMN "addedById" DROP NOT NULL;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "deletionAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "deletionPhotoPolicy" "AccountDeletionPhotoPolicy";

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventAccess" ADD CONSTRAINT "EventAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Photo" ADD CONSTRAINT "Photo_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
