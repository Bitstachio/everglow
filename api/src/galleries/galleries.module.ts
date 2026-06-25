import { Module } from "@nestjs/common";
import { CaslModule } from "src/casl/casl.module";
import { GalleriesController } from "./galleries.controller";
import { GalleriesService } from "./galleries.service";

@Module({
  imports: [CaslModule],
  controllers: [GalleriesController],
  providers: [GalleriesService],
  exports: [GalleriesService],
})
export class GalleriesModule {}
