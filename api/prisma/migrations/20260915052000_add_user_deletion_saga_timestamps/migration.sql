-- AlterTable
ALTER TABLE "User" ADD COLUMN "deletionStartedAt" TIMESTAMP(3),
ADD COLUMN "auth0DeletedAt" TIMESTAMP(3);

-- CreateIndex (partial: only rows mid account-deletion saga)
CREATE INDEX "User_deletionStartedAt_idx" ON "User"("deletionStartedAt") WHERE "deletionStartedAt" IS NOT NULL;
