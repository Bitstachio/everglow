-- DropForeignKey
ALTER TABLE `UserDetails` DROP FOREIGN KEY `UserDetails_userId_fkey`;

-- AddForeignKey
ALTER TABLE `UserDetails` ADD CONSTRAINT `UserDetails_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
