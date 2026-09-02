import { Module } from "@nestjs/common";
import { CaslModule } from "src/casl/casl.module";
import { PhotoStorageService } from "./photo-storage.service";
import { PhotosController } from "./photos.controller";
import { PhotosService } from "./photos.service";

@Module({
  imports: [CaslModule],
  controllers: [PhotosController],
  providers: [PhotosService, PhotoStorageService],
  exports: [PhotosService, PhotoStorageService],
})
export class PhotosModule {}
