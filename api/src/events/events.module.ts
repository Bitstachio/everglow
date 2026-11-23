import { Module } from "@nestjs/common";
import { CaslModule } from "src/casl/casl.module";
import { ImagesModule } from "src/images/images.module";
import { ModerationModule } from "src/moderation/moderation.module";
import { NotificationsModule } from "src/notifications/notifications.module";
import { PhotosModule } from "src/photos/photos.module";
import { PlansModule } from "src/plans/plans.module";
import { EventCoverOrphanSource } from "./event-cover-orphan-source";
import { EventCoverService } from "./event-cover.service";
import { EventsController } from "./events.controller";
import { EventsService } from "./events.service";
import { GalleryOpenNotifyScheduler } from "./gallery-open-notify.scheduler";
import { GalleryOpenNotifyService } from "./gallery-open-notify.service";

@Module({
  imports: [CaslModule, PhotosModule, ImagesModule, ModerationModule, NotificationsModule, PlansModule],
  controllers: [EventsController],
  providers: [
    EventsService,
    EventCoverService,
    EventCoverOrphanSource,
    GalleryOpenNotifyService,
    GalleryOpenNotifyScheduler,
  ],
  exports: [EventsService],
})
export class EventsModule {}
