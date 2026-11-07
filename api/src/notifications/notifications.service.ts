import { Injectable } from "@nestjs/common";
import { NotificationType, Prisma } from "generated/prisma/client";
import { PrismaService } from "src/prisma/prisma.service";
import { NOTIFICATION_CATALOGUE, NotificationDataByType, NotificationDefinition } from "./notification-catalogue";
import { NotificationPreferencesService } from "./notification-preferences.service";
import { NotificationSenderService } from "./notification-sender.service";

/**
 * The one way a feature sends a notification (docs/notifications.md §3).
 *
 *   await this.prisma.$transaction(async (tx) => {
 *     ...the change the notification is about...
 *     await this.notifications.notify(tx, NotificationType.X, userIds, { eventId });
 *   });
 *   this.notifications.kick();
 *
 * Queued in the caller's transaction, so a notification exists exactly when
 * the change it is about committed. The dedupe key makes notifying twice for
 * the same occasion a no-op.
 */
@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly preferences: NotificationPreferencesService,
    private readonly sender: NotificationSenderService,
  ) {}

  /** Queues one notification per recipient. Returns how many are new: duplicates and people who opted out are not. */
  async notify<T extends NotificationType>(
    tx: Prisma.TransactionClient,
    type: T,
    userIds: string[],
    data: NotificationDataByType[T],
  ): Promise<number> {
    const unique = [...new Set(userIds)];
    if (unique.length === 0) return 0;

    const definition = NOTIFICATION_CATALOGUE[type] as NotificationDefinition<NotificationDataByType[T]>;
    const recipients = definition.required ? unique : await this.preferences.filterRecipients(tx, type, unique, data);
    if (recipients.length === 0) return 0;

    const { count } = await tx.notification.createMany({
      data: recipients.map((userId) => ({
        userId,
        type,
        data: data as Prisma.InputJsonValue,
        dedupeKey: definition.dedupeKey(userId, data),
      })),
      skipDuplicates: true,
    });
    return count;
  }

  /** Outside a transaction: queue, then send at once. */
  async notifyNow<T extends NotificationType>(
    type: T,
    userIds: string[],
    data: NotificationDataByType[T],
  ): Promise<number> {
    const count = await this.prisma.$transaction((tx) => this.notify(tx, type, userIds, data));
    if (count > 0) this.sender.kick();
    return count;
  }

  /**
   * After the transaction that called `notify` commits: send now rather than
   * at the sender's next tick. Never throws and never waits.
   */
  kick(): void {
    this.sender.kick();
  }
}
