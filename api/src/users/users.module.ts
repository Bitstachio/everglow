import { Module } from "@nestjs/common";
import { PhotosModule } from "src/photos/photos.module";
import { AccountDeletionService } from "./account-deletion.service";
import { UsersController } from "./users.controller";
import { UsersService } from "./users.service";

@Module({
  imports: [PhotosModule],
  controllers: [UsersController],
  providers: [UsersService, AccountDeletionService],
  exports: [UsersService],
})
export class UsersModule {}
