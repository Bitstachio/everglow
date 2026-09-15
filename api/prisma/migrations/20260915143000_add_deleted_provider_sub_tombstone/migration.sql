-- CreateTable
CREATE TABLE "DeletedProviderSub" (
    "providerSub" VARCHAR(255) NOT NULL,
    "formerUserId" UUID NOT NULL,
    "deletedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeletedProviderSub_pkey" PRIMARY KEY ("providerSub")
);

-- CreateIndex
CREATE INDEX "DeletedProviderSub_deletedAt_idx" ON "DeletedProviderSub"("deletedAt");
