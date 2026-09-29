-- CreateTable
CREATE TABLE "UsernameChange" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "oldUsername" VARCHAR(30) NOT NULL,
    "newUsername" VARCHAR(30) NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UsernameChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UsernameChange_userId_changedAt_idx" ON "UsernameChange"("userId", "changedAt");

-- AddForeignKey
ALTER TABLE "UsernameChange" ADD CONSTRAINT "UsernameChange_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
