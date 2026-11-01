-- A suspension and event bans outlive the account they were placed on, so
-- deleting it and signing in again does not lift them
-- (docs/account-deletion.md §6a). Additive only.

-- AlterTable
ALTER TABLE "DeletedProviderSub" ADD COLUMN "suspendedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "CarriedBan" (
    "providerSubHash" VARCHAR(64) NOT NULL,
    "eventId" UUID NOT NULL,
    "bannedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CarriedBan_pkey" PRIMARY KEY ("providerSubHash","eventId")
);

-- CreateIndex
CREATE INDEX "CarriedBan_eventId_idx" ON "CarriedBan"("eventId");

-- CreateIndex
CREATE INDEX "DeletedProviderSub_formerUserId_idx" ON "DeletedProviderSub"("formerUserId");

-- AddForeignKey
ALTER TABLE "CarriedBan" ADD CONSTRAINT "CarriedBan_providerSubHash_fkey" FOREIGN KEY ("providerSubHash") REFERENCES "DeletedProviderSub"("providerSubHash") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarriedBan" ADD CONSTRAINT "CarriedBan_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
