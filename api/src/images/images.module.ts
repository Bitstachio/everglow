import { Module } from "@nestjs/common";
import { StorageModule } from "src/storage/storage.module";
import { ImageUploadService } from "./image-upload.service";

/**
 * Entity-agnostic single-image uploads. StorageModule is re-exported so a
 * feature that imports this module can also register its `ImageOrphanSource`.
 */
@Module({
  imports: [StorageModule],
  providers: [ImageUploadService],
  exports: [ImageUploadService, StorageModule],
})
export class ImagesModule {}
