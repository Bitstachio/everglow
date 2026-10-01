import { Module } from "@nestjs/common";
import { CaslModule } from "src/casl/casl.module";
import { ImagesModule } from "src/images/images.module";
import { ModerationModule } from "src/moderation/moderation.module";
import { PlansModule } from "src/plans/plans.module";
import { StorageModule } from "src/storage/storage.module";
import { PhotoOrphanSource } from "./photo-orphan-source";
import { PhotoPendingCleanupScheduler } from "./photo-pending-cleanup.scheduler";
import { PhotoPendingCleanupService } from "./photo-pending-cleanup.service";
import { PhotoPurgeService } from "./photo-purge.service";
import { PhotoStorageService } from "./photo-storage.service";
import { PhotosController } from "./photos.controller";
import { PhotosService } from "./photos.service";

@Module({
  imports: [CaslModule, ImagesModule, ModerationModule, PlansModule, StorageModule],
  controllers: [PhotosController],
  providers: [
    PhotosService,
    PhotoStorageService,
    PhotoPurgeService,
    PhotoPendingCleanupService,
    PhotoPendingCleanupScheduler,
    PhotoOrphanSource,
  ],
  exports: [PhotosService, PhotoStorageService, PhotoPurgeService],
})
export class PhotosModule {}
