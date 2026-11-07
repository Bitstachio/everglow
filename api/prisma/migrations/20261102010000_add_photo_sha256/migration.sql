-- Each photo's SHA-256, recorded at confirm, to find and refuse identical
-- copies of a removed intimate image (docs/moderation.md §7). Additive: a
-- nullable column and two indexes; existing photos are hashed by the opt-in
-- backfill job (PHOTO_HASH_BACKFILL_ENABLED).

-- AlterTable
ALTER TABLE "Photo" ADD COLUMN "sha256" CHAR(64);

-- CreateIndex
CREATE INDEX "Photo_sha256_idx" ON "Photo"("sha256");

-- CreateIndex
CREATE INDEX "ReportEvidence_sha256_idx" ON "ReportEvidence"("sha256");
