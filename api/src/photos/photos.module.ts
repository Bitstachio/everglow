import { Module } from "@nestjs/common";
import { CaslModule } from "src/casl/casl.module";
import { PhotoPendingCleanupScheduler } from "./photo-pending-cleanup.scheduler";
import { PhotoPendingCleanupService } from "./photo-pending-cleanup.service";
import { PhotosController } from "./photos.controller";
import { PhotosService } from "./photos.service";

@Module({
  imports: [CaslModule],
  controllers: [PhotosController],
  providers: [PhotosService, PhotoPendingCleanupService, PhotoPendingCleanupScheduler],
  exports: [PhotosService],
})
export class PhotosModule {}
