-- CreateEnum
CREATE TYPE "PhotoStatus" AS ENUM ('PENDING', 'READY');

-- AlterTable
ALTER TABLE "Photo" DROP COLUMN "imageUrl",
ADD COLUMN     "contentType" VARCHAR(100) NOT NULL,
ADD COLUMN     "s3Key" VARCHAR(255) NOT NULL,
ADD COLUMN     "sizeBytes" INTEGER NOT NULL,
ADD COLUMN     "status" "PhotoStatus" NOT NULL DEFAULT 'PENDING';

-- CreateIndex
CREATE UNIQUE INDEX "Photo_s3Key_key" ON "Photo"("s3Key");

-- CreateIndex
CREATE INDEX "Photo_galleryId_status_createdAt_idx" ON "Photo"("galleryId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Photo_addedById_idx" ON "Photo"("addedById");

