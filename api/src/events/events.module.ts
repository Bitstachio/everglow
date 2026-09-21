import { Module } from "@nestjs/common";
import { CaslModule } from "src/casl/casl.module";
import { ImagesModule } from "src/images/images.module";
import { PhotosModule } from "src/photos/photos.module";
import { EventsController } from "./events.controller";
import { EventsService } from "./events.service";

@Module({
  imports: [CaslModule, PhotosModule, ImagesModule],
  controllers: [EventsController],
  providers: [EventsService],
  exports: [EventsService],
})
export class EventsModule {}
