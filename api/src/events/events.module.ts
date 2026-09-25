import { Module } from "@nestjs/common";
import { CaslModule } from "src/casl/casl.module";
import { ImagesModule } from "src/images/images.module";
import { PhotosModule } from "src/photos/photos.module";
import { EventCoverOrphanSource } from "./event-cover-orphan-source";
import { EventCoverService } from "./event-cover.service";
import { EventsController } from "./events.controller";
import { EventsService } from "./events.service";

@Module({
  imports: [CaslModule, PhotosModule, ImagesModule],
  controllers: [EventsController],
  providers: [EventsService, EventCoverService, EventCoverOrphanSource],
  exports: [EventsService],
})
export class EventsModule {}
