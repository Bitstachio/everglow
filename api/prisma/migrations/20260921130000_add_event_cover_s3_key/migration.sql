-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "coverS3Key" VARCHAR(255);

-- CreateIndex
CREATE UNIQUE INDEX "Event_coverS3Key_key" ON "Event"("coverS3Key");

