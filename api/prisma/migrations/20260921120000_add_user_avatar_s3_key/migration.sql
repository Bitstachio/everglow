-- AlterTable
ALTER TABLE "UserDetails" ADD COLUMN     "avatarS3Key" VARCHAR(255);

-- CreateIndex
CREATE UNIQUE INDEX "UserDetails_avatarS3Key_key" ON "UserDetails"("avatarS3Key");
