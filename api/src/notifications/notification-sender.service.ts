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
  /** Claims another pass took over after this one's lease ran out; nothing was written for them. */
  leaseLost: number;
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

/**
 * How one claimed notification ends this pass, and what that writes. Nothing
 * is written unless the pass still holds the lease (`settle`).
 */
interface Outcome {
  claim: ClaimedNotification;
  kind: "sent" | "failed" | "skipped" | "retried" | "given_up";
  /** Stored as lastError: an Expo code or a short reason. Null when sent cleanly. */
  reason: string | null;
  /** For "retried": when to try again. */
  nextAttemptAt?: Date;
  deliveries?: Prisma.NotificationDeliveryCreateManyInput[];
  invalidDeviceIds?: string[];
  /** For the sent/failed log line. */
  devices?: number;
  accepted?: number;
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
      leaseLost: 0,
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
    const settled: Outcome[] = [];
    for (const claim of claimed) {
      const user = usersById.get(claim.userId);
      if (claim.attempts > maxAttempts) {
        // Claimed again after passes that died mid-send: stop here rather than loop.
        settled.push({ claim, kind: "given_up", reason: "attempts_exhausted" });
      } else if (!user || user.deletionStartedAt) {
        settled.push({ claim, kind: "skipped", reason: "account_deleting" });
      } else if (user.devices.length === 0) {
        settled.push({ claim, kind: "skipped", reason: "no_devices" });
      } else {
        const rendered = this.render(claim);
        if (rendered) outgoing.push({ claim, rendered, devices: user.devices });
        else settled.push({ claim, kind: "failed", reason: "render_failed" });
      }
    }
    await this.settle(settled, result);

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
      const reason = error.status ? `http_${error.status}` : "network";
      await this.settle(
        chunk.map(({ claim }) => this.retryOrGiveUp(claim, reason)),
        result,
      );
      return;
    }

    const outcomes: Outcome[] = [];
    let offset = 0;
    for (const { claim, devices } of chunk) {
      const own = tickets.slice(offset, offset + devices.length);
      offset += devices.length;

      const invalidDeviceIds: string[] = [];
      const deliveries = devices.map((device, index): Prisma.NotificationDeliveryCreateManyInput => {
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
      outcomes.push({
        claim,
        kind: accepted > 0 ? "sent" : "failed",
        reason: accepted > 0 ? null : firstError,
        deliveries,
        invalidDeviceIds,
        devices: devices.length,
        accepted,
      });
    }
    await this.settle(outcomes, result);
  }

  /** Back to PENDING with a backoff, or FAILED once the attempts are used up. */
  private retryOrGiveUp(claim: ClaimedNotification, reason: string): Outcome {
    if (claim.attempts >= this.maxAttempts()) return { claim, kind: "given_up", reason };
    return {
      claim,
      kind: "retried",
      reason,
      nextAttemptAt: new Date(Date.now() + retryDelaySeconds(claim.attempts) * 1000),
    };
  }

  /**
   * Writes each outcome only if this pass still holds the claim. The status
   * update is matched on the lease and runs first; a notification whose lease
   * another pass took over (count 0) gets no deliveries, deletes no phones
   * and is not counted, so a pass that overran its lease cannot record a send
   * twice. Counts and log lines follow the commit.
   */
  private async settle(outcomes: Outcome[], result: SendRunResult): Promise<void> {
    if (outcomes.length === 0) return;
    const now = new Date();
    const held = await this.prisma.$transaction(async (tx) => {
      const won: Outcome[] = [];
      for (const outcome of outcomes) {
        const { count } = await tx.notification.updateMany({
          where: { id: outcome.claim.id, claimedUntil: outcome.claim.claimedUntil },
          data: settledData(outcome, now),
        });
        if (count === 1) won.push(outcome);
      }
      const deliveries = won.flatMap((outcome) => outcome.deliveries ?? []);
      if (deliveries.length > 0) await tx.notificationDelivery.createMany({ data: deliveries });
      const invalidDeviceIds = [...new Set(won.flatMap((outcome) => outcome.invalidDeviceIds ?? []))];
      if (invalidDeviceIds.length > 0) await tx.userDevice.deleteMany({ where: { id: { in: invalidDeviceIds } } });
      return { won, invalidDeviceIds };
    });

    const won = new Set(held.won);
    for (const outcome of outcomes) {
      if (won.has(outcome)) this.record(outcome, result);
      else this.recordLeaseLost(outcome, result);
    }
    if (held.invalidDeviceIds.length > 0) {
      result.invalidatedDevices += held.invalidDeviceIds.length;
      this.logInvalidated(held.invalidDeviceIds);
    }
  }

  private record(outcome: Outcome, result: SendRunResult): void {
    const { claim } = outcome;
    switch (outcome.kind) {
      case "skipped":
        result.skipped++;
        return;
      case "retried":
        result.retried++;
        return;
      case "given_up":
        result.givenUp++;
        this.logger.error(
          {
            event: ALERT_EVENTS.NOTIFICATION_GIVEN_UP,
            severity: ALERT_SEVERITY.TICKET,
            notificationId: claim.id,
            type: claim.type,
            attempts: claim.attempts,
            reason: outcome.reason,
          },
          "A notification ran out of attempts and will not be sent",
        );
        return;
      case "sent":
      case "failed": {
        if (outcome.kind === "sent") result.sent++;
        else result.failed++;
        if (outcome.devices === undefined) return; // Failed before any send (render_failed).
        this.logger.info(
          {
            event: outcome.kind === "sent" ? "notification.sent" : "notification.failed",
            notificationId: claim.id,
            userId: claim.userId,
            type: claim.type,
            devices: outcome.devices,
            accepted: outcome.accepted,
            ...(outcome.reason ? { error: outcome.reason } : {}),
          },
          outcome.kind === "sent" ? "Notification sent" : "Every phone refused a notification",
        );
      }
    }
  }

  private recordLeaseLost(outcome: Outcome, result: SendRunResult): void {
    result.leaseLost++;
    this.logger.warn(
      {
        event: "notification.lease_lost",
        notificationId: outcome.claim.id,
        type: outcome.claim.type,
        outcome: outcome.kind,
      },
      "Another pass took this notification over after its lease ran out; this pass wrote nothing for it",
    );
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

/** The status write for an outcome. Every outcome releases the lease. */
const settledData = (outcome: Outcome, now: Date): Prisma.NotificationUpdateManyMutationInput => {
  switch (outcome.kind) {
    case "sent":
      return { status: NotificationStatus.SENT, sentAt: now, claimedUntil: null, lastError: outcome.reason };
    case "failed":
    case "given_up":
      return { status: NotificationStatus.FAILED, claimedUntil: null, lastError: outcome.reason };
    case "skipped":
      return { status: NotificationStatus.SKIPPED, claimedUntil: null, lastError: outcome.reason };
    case "retried":
      return { claimedUntil: null, lastError: outcome.reason, nextAttemptAt: outcome.nextAttemptAt };
  }
};

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
