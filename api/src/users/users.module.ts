import { Module } from "@nestjs/common";
import { PhotosModule } from "src/photos/photos.module";
import { AccountDeletionPrepService } from "./account-deletion-prep.service";
import { AccountDeletionReconcilerScheduler } from "./account-deletion-reconciler.scheduler";
import { AccountDeletionReconcilerService } from "./account-deletion-reconciler.service";
import { AppleIdentityRevocationService } from "./apple-identity-revocation.service";
import { UsersController } from "./users.controller";
import { UsersService } from "./users.service";

@Module({
  imports: [PhotosModule],
  controllers: [UsersController],
  providers: [
    UsersService,
    AccountDeletionPrepService,
    AppleIdentityRevocationService,
    AccountDeletionReconcilerService,
    AccountDeletionReconcilerScheduler,
  ],
  exports: [UsersService],
})
export class UsersModule {}
