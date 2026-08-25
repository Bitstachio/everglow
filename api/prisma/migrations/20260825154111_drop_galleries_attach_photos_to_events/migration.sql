/*
  Warnings:

  - You are about to drop the column `galleryId` on the `Photo` table. All the data in the column will be lost.
  - You are about to drop the `Gallery` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `eventId` to the `Photo` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "Gallery" DROP CONSTRAINT "Gallery_eventId_fkey";

-- DropForeignKey
ALTER TABLE "Photo" DROP CONSTRAINT "Photo_galleryId_fkey";

-- DropIndex
DROP INDEX "Photo_galleryId_status_createdAt_idx";

-- AlterTable
ALTER TABLE "Photo" DROP COLUMN "galleryId",
ADD COLUMN     "eventId" UUID NOT NULL;

-- DropTable
DROP TABLE "Gallery";

-- CreateIndex
CREATE INDEX "Photo_eventId_status_createdAt_idx" ON "Photo"("eventId", "status", "createdAt");

-- AddForeignKey
ALTER TABLE "Photo" ADD CONSTRAINT "Photo_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
