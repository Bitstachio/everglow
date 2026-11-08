import { Module } from "@nestjs/common";
import { DevicesController } from "./devices.controller";
import { DevicesService } from "./devices.service";
import { NotificationPreferencesService } from "./notification-preferences.service";
import { NotificationSenderService } from "./notification-sender.service";
import { NotificationsScheduler } from "./notifications.scheduler";
import { NotificationsService } from "./notifications.service";

@Module({
  controllers: [DevicesController],
  providers: [
    DevicesService,
    NotificationPreferencesService,
    NotificationSenderService,
    NotificationsService,
    NotificationsScheduler,
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
