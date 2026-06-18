/*
  Warnings:

  - You are about to alter the column `title` on the `Event` table. The data in that column could be lost. The data in that column will be cast from `VarChar(200)` to `VarChar(100)`.
  - You are about to alter the column `name` on the `Gallery` table. The data in that column could be lost. The data in that column will be cast from `VarChar(200)` to `VarChar(100)`.

*/
-- AlterTable
ALTER TABLE "Event" ALTER COLUMN "title" SET DATA TYPE VARCHAR(100);

-- AlterTable
ALTER TABLE "Gallery" ALTER COLUMN "name" SET DATA TYPE VARCHAR(100);
