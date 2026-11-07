import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NotificationDeliveryStatus, NotificationStatus, Prisma } from "generated/prisma/client";
import { PinoLogger } from "nestjs-pino";
import { ALERT_EVENTS, ALERT_SEVERITY } from "src/common/logging/alert-events.constants";
import { PrismaService } from "src/prisma/prisma.service";
import {
  EXPO_MAX_MESSAGES_PER_REQUEST,
  EXPO_MAX_RECEIPT_IDS_PER_REQUEST,
  ExpoPushRequestError,
  ExpoPushService,
} from "src/sdk/expo/expo-push.service";
import { EXPO_DEVICE_NOT_REGISTERED, ExpoPushMessage, ExpoPushTicket } from "src/sdk/expo/expo-push.types";
import { NotificationDataByType, RenderedNotification, renderNotification } from "./notification-catalogue";
import { ClaimedNotification, claimDueNotifications } from "./notification-claim";
import {
  NOTIFICATION_ANDROID_CHANNEL_ID,
  NOTIFICATION_RECEIPT_MAX_AGE_HOURS,
  NOTIFICATION_RECEIPT_MIN_AGE_MINUTES,
  NOTIFICATION_RETRY_BASE_SECONDS,
  NOTIFICATION_RETRY_MAX_SECONDS,
  NOTIFICATION_SEND_BATCH_SIZE,
  NOTIFICATION_SEND_MAX_BATCHES_PER_RUN,
} from "./notifications.constants";

export interface SendRunResult {
  claimed: number;
  sent: number;
  failed: number;
  skipped: number;
  retried: number;
  givenUp: number;
  invalidatedDevices: number;
}

export interface ReceiptRunResult {
  checked: number;
  delivered: number;
  failed: number;
  invalidatedDevices: number;
}

export interface RetentionRunResult {
  notifications: number;
  devices: number;
}

/** A claimed notification with what to send and where. */
interface Outgoing {
  claim: ClaimedNotification;
  rendered: RenderedNotification;
  devices: { id: string; token: string }[];
}

const MAX_RECEIPT_PAGES_PER_RUN = 10;
const MAX_ERROR_LENGTH = 64;

const errorCode = (ticket: { message: string; details?: { error?: string } }): string =>
  (ticket.details?.error ?? "Unknown").slice(0, MAX_ERROR_LENGTH);

export const retryDelaySeconds = (attempts: number): number =>
  Math.min(NOTIFICATION_RETRY_BASE_SECONDS * 2 ** Math.max(0, attempts - 1), NOTIFICATION_RETRY_MAX_SECONDS);

/**
 * Sends the outbox through Expo, checks receipts, and deletes what is past
 * retention (docs/notifications.md §4). Push tokens are never logged.
 *
 * Delivery is once per notification in every case but one: if the process
 * dies after Expo accepted a batch and before the result is written, the
 * lease runs out and the batch is sent again. Expo has no idempotency key to
 * close that gap.
 */
@Injectable()
export class NotificationSenderService {
  private running: Promise<SendRunResult> | null = null;
  private rerun = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly expo: ExpoPushService,
    private readonly configService: ConfigService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(this.constructor.name);
  }

  isEnabled(): boolean {
    return this.configService.get<boolean>("notifications.senderEnabled") === true;
  }

  /** Send now, in the background. A kick during a run makes it run once more. Never throws. */
  kick(): void {
    if (!this.isEnabled()) return;
    this.sendPending().catch((error: unknown) => {
      this.logger.error(
        { err: error as Error, event: "notification.send.kick_failed" },
        "Sending notifications after a commit failed; the next run retries",
      );
    });
  }

  /** One run at a time per process; a call during a run joins it and asks for another. */
  sendPending(): Promise<SendRunResult> {
    if (this.running) {
      this.rerun = true;
      return this.running;
    }
    this.running = this.runSend().finally(() => {
      this.running = null;
      if (this.rerun) {
        this.rerun = false;
        this.kick();
      }
    });
    return this.running;
  }

  private async runSend(): Promise<SendRunResult> {
    const result: SendRunResult = {
      claimed: 0,
      sent: 0,
      failed: 0,
      skipped: 0,
      retried: 0,
      givenUp: 0,
      invalidatedDevices: 0,
    };
    for (let batch = 0; batch < NOTIFICATION_SEND_MAX_BATCHES_PER_RUN; batch++) {
      const claimed = await claimDueNotifications(this.prisma, NOTIFICATION_SEND_BATCH_SIZE);
      if (claimed.length === 0) break;
      result.claimed += claimed.length;
      await this.sendBatch(claimed, result);
      if (claimed.length < NOTIFICATION_SEND_BATCH_SIZE) break;
    }
    return result;
  }

  private async sendBatch(claimed: ClaimedNotification[], result: SendRunResult): Promise<void> {
    const maxAttempts = this.maxAttempts();
    const users = await this.prisma.user.findMany({
      where: { id: { in: [...new Set(claimed.map((claim) => claim.userId))] } },
      select: { id: true, deletionStartedAt: true, devices: { select: { id: true, token: true } } },
    });
    const usersById = new Map(users.map((user) => [user.id, user]));

    const outgoing: Outgoing[] = [];
    for (const claim of claimed) {
      const user = usersById.get(claim.userId);
      if (claim.attempts > maxAttempts) {
        // Claimed again after passes that died mid-send: stop here rather than loop.
        await this.giveUp(claim, "attempts_exhausted", result);
      } else if (!user || user.deletionStartedAt) {
        await this.settle(claim, NotificationStatus.SKIPPED, "account_deleting", result);
      } else if (user.devices.length === 0) {
        await this.settle(claim, NotificationStatus.SKIPPED, "no_devices", result);
      } else {
        const rendered = this.render(claim);
        if (rendered) outgoing.push({ claim, rendered, devices: user.devices });
        else await this.settle(claim, NotificationStatus.FAILED, "render_failed", result);
      }
    }

    for (const chunk of chunkByMessages(outgoing)) {
      await this.sendChunk(chunk, result);
    }
  }

  private render(claim: ClaimedNotification): RenderedNotification | null {
    try {
      return renderNotification(claim.type, claim.data as NotificationDataByType[typeof claim.type]);
    } catch (error) {
      this.logger.error(
        { err: error as Error, event: "notification.render_failed", notificationId: claim.id, type: claim.type },
        "A notification's data does not render; it will not be sent",
      );
      return null;
    }
  }

  private async sendChunk(chunk: Outgoing[], result: SendRunResult): Promise<void> {
    const messages: ExpoPushMessage[] = chunk.flatMap(({ claim, rendered, devices }) =>
      devices.map((device) => ({
        to: device.token,
        title: rendered.title,
        body: rendered.body,
        sound: "default" as const,
        channelId: NOTIFICATION_ANDROID_CHANNEL_ID,
        data: { url: rendered.url, type: claim.type, notificationId: claim.id },
      })),
    );

    let tickets: ExpoPushTicket[];
    try {
      tickets = await this.expo.send(messages);
    } catch (error) {
      if (!(error instanceof ExpoPushRequestError)) throw error;
      this.logger.warn(
        { err: error, event: "notification.expo.request_failed", status: error.status, notifications: chunk.length },
        "Expo refused or did not answer a push request; the notifications in it are retried",
      );
      for (const { claim } of chunk)
        await this.retryOrGiveUp(claim, error.status ? `http_${error.status}` : "network", result);
      return;
    }

    const now = new Date();
    const operations: Prisma.PrismaPromise<unknown>[] = [];
    const invalidDeviceIds: string[] = [];
    let offset = 0;
    for (const { claim, devices } of chunk) {
      const own = tickets.slice(offset, offset + devices.length);
      offset += devices.length;

      const deliveries = devices.map((device, index) => {
        const ticket = own[index];
        if (ticket.status === "ok") {
          return {
            notificationId: claim.id,
            deviceId: device.id,
            status: NotificationDeliveryStatus.TICKETED,
            ticketId: ticket.id,
          };
        }
        const code = errorCode(ticket);
        if (code === EXPO_DEVICE_NOT_REGISTERED) invalidDeviceIds.push(device.id);
        return {
          notificationId: claim.id,
          deviceId: device.id,
          status: NotificationDeliveryStatus.FAILED,
          error: code,
        };
      });
      const accepted = deliveries.filter((delivery) => delivery.status === NotificationDeliveryStatus.TICKETED).length;
      const firstError = deliveries.find((delivery) => delivery.error)?.error ?? null;

      operations.push(this.prisma.notificationDelivery.createMany({ data: deliveries }));
      operations.push(
        this.prisma.notification.updateMany({
          where: { id: claim.id, claimedUntil: claim.claimedUntil },
          data:
            accepted > 0
              ? { status: NotificationStatus.SENT, sentAt: now, claimedUntil: null, lastError: null }
              : { status: NotificationStatus.FAILED, claimedUntil: null, lastError: firstError },
        }),
      );
      if (accepted > 0) result.sent++;
      else result.failed++;
      this.logger.info(
        {
          event: accepted > 0 ? "notification.sent" : "notification.failed",
          notificationId: claim.id,
          userId: claim.userId,
          type: claim.type,
          devices: devices.length,
          accepted,
          ...(firstError ? { error: firstError } : {}),
        },
        accepted > 0 ? "Notification sent" : "Every phone refused a notification",
      );
    }
    if (invalidDeviceIds.length > 0) {
      operations.push(this.prisma.userDevice.deleteMany({ where: { id: { in: invalidDeviceIds } } }));
      result.invalidatedDevices += invalidDeviceIds.length;
      this.logInvalidated(invalidDeviceIds);
    }
    await this.prisma.$transaction(operations);
  }

  private async retryOrGiveUp(claim: ClaimedNotification, reason: string, result: SendRunResult): Promise<void> {
    if (claim.attempts >= this.maxAttempts()) {
      await this.giveUp(claim, reason, result);
      return;
    }
    await this.prisma.notification.updateMany({
      where: { id: claim.id, claimedUntil: claim.claimedUntil },
      data: {
        claimedUntil: null,
        lastError: reason,
        nextAttemptAt: new Date(Date.now() + retryDelaySeconds(claim.attempts) * 1000),
      },
    });
    result.retried++;
  }

  private async giveUp(claim: ClaimedNotification, reason: string, result: SendRunResult): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { id: claim.id, claimedUntil: claim.claimedUntil },
      data: { status: NotificationStatus.FAILED, claimedUntil: null, lastError: reason },
    });
    result.givenUp++;
    this.logger.error(
      {
        event: ALERT_EVENTS.NOTIFICATION_GIVEN_UP,
        severity: ALERT_SEVERITY.TICKET,
        notificationId: claim.id,
        type: claim.type,
        attempts: claim.attempts,
        reason,
      },
      "A notification ran out of attempts and will not be sent",
    );
  }

  private async settle(
    claim: ClaimedNotification,
    status: NotificationStatus,
    reason: string,
    result: SendRunResult,
  ): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { id: claim.id, claimedUntil: claim.claimedUntil },
      data: { status, claimedUntil: null, lastError: reason },
    });
    if (status === NotificationStatus.SKIPPED) result.skipped++;
    else result.failed++;
  }

  /**
   * Receipts: whether Apple or Google took each push Expo accepted. A phone
   * that uninstalled the app shows up here as DeviceNotRegistered, and is
   * dropped. Pages by ticket id, so a receipt that is not ready yet is not
   * read twice in one run.
   */
  async checkReceipts(now: Date = new Date()): Promise<ReceiptRunResult> {
    const result: ReceiptRunResult = { checked: 0, delivered: 0, failed: 0, invalidatedDevices: 0 };
    const createdAt = {
      lte: new Date(now.getTime() - NOTIFICATION_RECEIPT_MIN_AGE_MINUTES * 60_000),
      gte: new Date(now.getTime() - NOTIFICATION_RECEIPT_MAX_AGE_HOURS * 3_600_000),
    };
    let cursor: string | undefined;
    for (let page = 0; page < MAX_RECEIPT_PAGES_PER_RUN; page++) {
      const deliveries = await this.prisma.notificationDelivery.findMany({
        where: {
          status: NotificationDeliveryStatus.TICKETED,
          createdAt,
          ticketId: cursor ? { gt: cursor } : { not: null },
        },
        orderBy: { ticketId: "asc" },
        take: EXPO_MAX_RECEIPT_IDS_PER_REQUEST,
        select: { id: true, ticketId: true, deviceId: true },
      });
      if (deliveries.length === 0) break;
      cursor = deliveries[deliveries.length - 1].ticketId ?? undefined;

      const receipts = await this.expo.getReceipts(deliveries.map((delivery) => delivery.ticketId as string));
      const delivered: string[] = [];
      const failedByCode = new Map<string, string[]>();
      const invalidDeviceIds: string[] = [];
      for (const delivery of deliveries) {
        const receipt = receipts[delivery.ticketId as string];
        if (!receipt) continue;
        result.checked++;
        if (receipt.status === "ok") {
          delivered.push(delivery.id);
          continue;
        }
        const code = errorCode(receipt);
        failedByCode.set(code, [...(failedByCode.get(code) ?? []), delivery.id]);
        if (code === EXPO_DEVICE_NOT_REGISTERED) invalidDeviceIds.push(delivery.deviceId);
      }

      const operations: Prisma.PrismaPromise<unknown>[] = [];
      if (delivered.length > 0) {
        operations.push(
          this.prisma.notificationDelivery.updateMany({
            where: { id: { in: delivered } },
            data: { status: NotificationDeliveryStatus.DELIVERED },
          }),
        );
      }
      for (const [code, ids] of failedByCode) {
        operations.push(
          this.prisma.notificationDelivery.updateMany({
            where: { id: { in: ids } },
            data: { status: NotificationDeliveryStatus.FAILED, error: code },
          }),
        );
        result.failed += ids.length;
      }
      if (invalidDeviceIds.length > 0) {
        operations.push(this.prisma.userDevice.deleteMany({ where: { id: { in: invalidDeviceIds } } }));
        result.invalidatedDevices += invalidDeviceIds.length;
        this.logInvalidated(invalidDeviceIds);
      }
      if (operations.length > 0) await this.prisma.$transaction(operations);
      result.delivered += delivered.length;

      if (deliveries.length < EXPO_MAX_RECEIPT_IDS_PER_REQUEST) break;
    }
    return result;
  }

  /** Deletes notifications past retention, with their deliveries, and phones not seen for months. */
  async purgeExpired(now: Date = new Date()): Promise<RetentionRunResult> {
    const retentionDays = this.configService.get<number>("notifications.retentionDays") ?? 90;
    const deviceStaleDays = this.configService.get<number>("notifications.deviceStaleDays") ?? 270;
    const day = 86_400_000;
    const notifications = await this.prisma.notification.deleteMany({
      where: { createdAt: { lt: new Date(now.getTime() - retentionDays * day) } },
    });
    const devices = await this.prisma.userDevice.deleteMany({
      where: { lastSeenAt: { lt: new Date(now.getTime() - deviceStaleDays * day) } },
    });
    return { notifications: notifications.count, devices: devices.count };
  }

  private logInvalidated(deviceIds: string[]): void {
    this.logger.info(
      { event: "notification.device.invalidated", deviceIds },
      "Expo says these phones no longer take pushes; they were unregistered",
    );
  }

  private maxAttempts(): number {
    return this.configService.get<number>("notifications.maxAttempts") ?? 5;
  }
}

/** Groups outgoing notifications into Expo requests without splitting one across two. */
export const chunkByMessages = (outgoing: Outgoing[]): Outgoing[][] => {
  const chunks: Outgoing[][] = [];
  let current: Outgoing[] = [];
  let size = 0;
  for (const item of outgoing) {
    if (size + item.devices.length > EXPO_MAX_MESSAGES_PER_REQUEST && current.length > 0) {
      chunks.push(current);
      current = [];
      size = 0;
    }
    current.push(item);
    size += item.devices.length;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
};
