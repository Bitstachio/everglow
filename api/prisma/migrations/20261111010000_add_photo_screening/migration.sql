-- Upload screening's verdict on each photo, and how long a held photo waits
-- (docs/moderation.md §11). Additive: every existing photo is UNSCREENED, and
-- nothing is held until MODERATION_SCREENING_ENABLED=true.

-- CreateEnum
CREATE TYPE "PhotoScreening" AS ENUM ('UNSCREENED', 'PENDING', 'CLEARED', 'FLAGGED', 'SKIPPED');

-- AlterTable
ALTER TABLE "Photo" ADD COLUMN     "screening" "PhotoScreening" NOT NULL DEFAULT 'UNSCREENED',
ADD COLUMN     "screeningHeldUntil" TIMESTAMP(3);

-- The screening job's queue: only held photos are in it.
-- CreateIndex
CREATE INDEX "Photo_screeningHeldUntil_idx" ON "Photo"("screeningHeldUntil") WHERE ("screening" = 'PENDING');
