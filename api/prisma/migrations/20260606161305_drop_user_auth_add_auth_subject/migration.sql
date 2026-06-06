/*
  Warnings:

  - You are about to drop the `UserAuth` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[providerSub]` on the table `User` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `providerSub` to the `User` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE `UserAuth` DROP FOREIGN KEY `UserAuth_userId_fkey`;

-- AlterTable
ALTER TABLE `User` ADD COLUMN `providerSub` VARCHAR(255) NOT NULL;

-- DropTable
DROP TABLE `UserAuth`;

-- CreateIndex
CREATE UNIQUE INDEX `User_providerSub_key` ON `User`(`providerSub`);
