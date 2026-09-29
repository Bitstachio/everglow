-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "coverUpdatedById" UUID;

-- CreateIndex
CREATE INDEX "Event_coverUpdatedById_idx" ON "Event"("coverUpdatedById");

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_coverUpdatedById_fkey" FOREIGN KEY ("coverUpdatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

