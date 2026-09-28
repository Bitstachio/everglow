import { Module } from "@nestjs/common";
import { CaslModule } from "src/casl/casl.module";
import { ImagesModule } from "src/images/images.module";
import { ModerationModule } from "src/moderation/moderation.module";
import { StorageModule } from "src/storage/storage.module";
import { PhotoOrphanSource } from "./photo-orphan-source";
import { PhotoPendingCleanupScheduler } from "./photo-pending-cleanup.scheduler";
import { PhotoPendingCleanupService } from "./photo-pending-cleanup.service";
import { PhotoPurgeService } from "./photo-purge.service";
import { PhotoStorageService } from "./photo-storage.service";
import { PhotosController } from "./photos.controller";
import { PhotosService } from "./photos.service";
import { UserPhotosService } from "./user-photos.service";

@Module({
  imports: [CaslModule, ImagesModule, ModerationModule, StorageModule],
  controllers: [PhotosController],
  providers: [
    PhotosService,
    PhotoStorageService,
    PhotoPurgeService,
    PhotoPendingCleanupService,
    PhotoPendingCleanupScheduler,
    PhotoOrphanSource,
    UserPhotosService,
  ],
  exports: [PhotosService, PhotoStorageService, PhotoPurgeService, UserPhotosService],
})
export class PhotosModule {}
