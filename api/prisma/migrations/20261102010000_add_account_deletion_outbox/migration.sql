-- S3 work an account deletion owes after its database changes commit, written
-- in prep's transaction and drained afterwards, so a pass that fails part way
-- no longer loses the keys it collected (docs/account-deletion.md §4).
-- Additive only.

-- CreateEnum
CREATE TYPE "AccountDeletionOutboxAction" AS ENUM ('PURGE', 'REKEY');

-- CreateTable
CREATE TABLE "AccountDeletionOutbox" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "action" "AccountDeletionOutboxAction" NOT NULL,
    "s3Key" VARCHAR(255) NOT NULL,
    "photoId" UUID,
    "targetS3Key" VARCHAR(255),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountDeletionOutbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AccountDeletionOutbox_action_s3Key_key" ON "AccountDeletionOutbox"("action", "s3Key");

-- CreateIndex
CREATE INDEX "AccountDeletionOutbox_userId_idx" ON "AccountDeletionOutbox"("userId");

-- CreateIndex
CREATE INDEX "AccountDeletionOutbox_createdAt_idx" ON "AccountDeletionOutbox"("createdAt");
