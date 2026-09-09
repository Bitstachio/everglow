import { Module } from "@nestjs/common";
import { CaslModule } from "src/casl/casl.module";
import { PhotoOrphanReconcilerScheduler } from "./photo-orphan-reconciler.scheduler";
import { PhotoOrphanReconcilerService } from "./photo-orphan-reconciler.service";
import { PhotoPendingCleanupScheduler } from "./photo-pending-cleanup.scheduler";
import { PhotoPendingCleanupService } from "./photo-pending-cleanup.service";
import { PhotoPurgeService } from "./photo-purge.service";
import { PhotoStorageService } from "./photo-storage.service";
import { PhotosController } from "./photos.controller";
import { PhotosService } from "./photos.service";

@Module({
  imports: [CaslModule],
  controllers: [PhotosController],
  providers: [
    PhotosService,
    PhotoStorageService,
    PhotoPurgeService,
    PhotoPendingCleanupService,
    PhotoPendingCleanupScheduler,
    PhotoOrphanReconcilerService,
    PhotoOrphanReconcilerScheduler,
  ],
  exports: [PhotosService, PhotoStorageService, PhotoPurgeService],
})
export class PhotosModule {}
