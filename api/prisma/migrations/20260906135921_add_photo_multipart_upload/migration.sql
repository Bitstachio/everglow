-- AlterTable
ALTER TABLE "Photo" ADD COLUMN     "multipartPartSizeBytes" INTEGER,
ADD COLUMN     "multipartUploadId" VARCHAR(2048);
