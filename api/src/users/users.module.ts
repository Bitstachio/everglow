import { Module } from "@nestjs/common";
import { ImagesModule } from "src/images/images.module";
import { PhotosModule } from "src/photos/photos.module";
import { AccountDeletionPrepService } from "./account-deletion-prep.service";
import { AccountDeletionReconcilerScheduler } from "./account-deletion-reconciler.scheduler";
import { AccountDeletionReconcilerService } from "./account-deletion-reconciler.service";
import { AppleIdentityRevocationService } from "./apple-identity-revocation.service";
import { UserAvatarOrphanSource } from "./user-avatar-orphan-source";
import { UserAvatarService } from "./user-avatar.service";
import { UsersController } from "./users.controller";
import { UsersService } from "./users.service";

@Module({
  imports: [PhotosModule, ImagesModule],
  controllers: [UsersController],
  providers: [
    UsersService,
    UserAvatarService,
    UserAvatarOrphanSource,
    AccountDeletionPrepService,
    AppleIdentityRevocationService,
    AccountDeletionReconcilerService,
    AccountDeletionReconcilerScheduler,
  ],
  exports: [UsersService],
})
export class UsersModule {}
