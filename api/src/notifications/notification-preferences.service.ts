import { Injectable } from "@nestjs/common";
import { NotificationType, Prisma } from "generated/prisma/client";
import { NotificationDataByType } from "./notification-catalogue";

/**
 * Who has turned a type off, overall or for one event. Allows everyone for
 * now: EV-142 builds the settings and fills this in. NotificationsService
 * calls it for every type that is not `required`.
 */
@Injectable()
export class NotificationPreferencesService {
  // eslint-disable-next-line @typescript-eslint/require-await
  async filterRecipients<T extends NotificationType>(
    _tx: Prisma.TransactionClient,
    _type: T,
    userIds: string[],
    _data: NotificationDataByType[T],
  ): Promise<string[]> {
    return userIds;
  }
}
