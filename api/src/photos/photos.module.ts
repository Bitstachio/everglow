import { Module } from "@nestjs/common";
import { CaslModule } from "src/casl/casl.module";
import { PhotoOrphanReconcilerScheduler } from "./photo-orphan-reconciler.scheduler";
import { PhotoOrphanReconcilerService } from "./photo-orphan-reconciler.service";
import { PhotoStorageService } from "./photo-storage.service";
import { PhotosController } from "./photos.controller";
import { PhotosService } from "./photos.service";

@Module({
  imports: [CaslModule],
  controllers: [PhotosController],
  providers: [PhotosService, PhotoStorageService, PhotoOrphanReconcilerService, PhotoOrphanReconcilerScheduler],
  exports: [PhotosService, PhotoStorageService],
})
export class PhotosModule {}
