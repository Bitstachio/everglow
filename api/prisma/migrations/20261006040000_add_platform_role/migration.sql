-- Platform moderators (docs/moderation.md §8). Granted only in the database.

-- CreateEnum
CREATE TYPE "PlatformRole" AS ENUM ('MODERATOR');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "platformRole" "PlatformRole";
