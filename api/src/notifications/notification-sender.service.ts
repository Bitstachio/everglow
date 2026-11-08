import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { DevicePlatform, NotificationDeliveryStatus, NotificationStatus, Prisma } from "generated/prisma/client";
import { PinoLogger } from "nestjs-pino";
import { ALERT_EVENTS, ALERT_SEVERITY } from "src/common/logging/alert-events.constants";
import { runExclusively } from "src/prisma/advisory-lock";
import { PrismaService } from "src/prisma/prisma.service";
import {
  EXPO_MAX_MESSAGES_PER_REQUEST,
  EXPO_MAX_RECEIPT_IDS_PER_REQUEST,
  ExpoPushRequestError,
  ExpoPushService,
} from "src/sdk/expo/expo-push.service";
import {
  EXPO_CREDENTIAL_ERRORS,
  EXPO_DEVICE_NOT_REGISTERED,
  EXPO_MESSAGE_RATE_EXCEEDED,
  ExpoPushMessage,
  ExpoPushTicket,
} from "src/sdk/expo/expo-push.types";
import {
  NotificationChannel,
  NotificationLocale,
  RenderedNotification,
  notificationDefinitionOf,
  resolveNotificationLocale,
} from "./notification-catalogue";
import { ClaimedNotification, claimDueNotifications } from "./notification-claim";
import {
  DEFAULT_NOTIFICATION_MAX_ATTEMPTS,
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
  /** Receipts that said MessageRateExceeded. Logged, not resent (docs/notifications.md §4). */
  rateLimited: number;
  /** Another replica held the receipts lock, so this one did nothing. */
  ranElsewhere?: true;
}

export interface RetentionRunResult {
  notifications: number;
  devices: number;
  /** Another replica held the retention lock, so this one did nothing. */
  ranElsewhere?: true;
}

interface Device {
  id: string;
  token: string;
  platform: DevicePlatform;
  locale: string | null;
}

/** A claimed notification with what to send and where: one message per phone, in its language. */
interface Outgoing {
  claim: ClaimedNotification;
  devices: (Device & { rendered: RenderedNotification })[];
  channel: NotificationChannel;
  ttlSeconds?: number;
}

/** Expo's ticket for one message, or why its request got none. */
type Answer = ExpoPushTicket | { status: "request_failed"; reason: string; retryAfterSeconds: number };

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

// Receipts and retention run on one replica at a time (runExclusively). The
// timeouts are well past a run's length: 10 receipt pages at Expo's 10 s
// request timeout, and two deletes.
const RECEIPTS_LOCK_KEY = "notifications:receipts";
const RECEIPTS_LOCK_TIMEOUT_MS = 10 * 60_000;
const RETENTION_LOCK_KEY = "notifications:retention";
const RETENTION_LOCK_TIMEOUT_MS = 30 * 60_000;

const emptyReceiptResult = (): ReceiptRunResult => ({
  checked: 0,
  delivered: 0,
  failed: 0,
  invalidatedDevices: 0,
  rateLimited: 0,
});
const MAX_ERROR_LENGTH = 64;

const errorCode = (ticket: { message: string; details?: { error?: string } }): string =>
  (ticket.details?.error ?? "Unknown").slice(0, MAX_ERROR_LENGTH);

/** Seconds to wait after a failed attempt: 1, 2, 4, 8, 16, 32 minutes, then an hour each. */
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
  /** Set by a 429: no new batch is claimed before then, so the rest waits in the outbox, unattempted. */
  private pausedUntil = 0;

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
      if (Date.now() < this.pausedUntil) break;
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
      select: {
        id: true,
        deletionStartedAt: true,
        devices: { select: { id: true, token: true, platform: true, locale: true } },
      },
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
        const rendered = this.render(claim, user.devices);
        if (typeof rendered === "string") settled.push({ claim, kind: "failed", reason: rendered });
        else outgoing.push(rendered);
      }
    }
    await this.settle(settled, result);

    for (const chunk of chunkByMessages(outgoing)) {
      await this.sendChunk(chunk, result);
    }
  }

  /**
   * Builds each phone's copy, once per language. Returns why not instead
   * when the stored data no longer has the type's shape (written by older
   * code) or rendering throws: the notification is then FAILED, not sent.
   */
  private render(claim: ClaimedNotification, devices: Device[]): Outgoing | "invalid_data" | "render_failed" {
    const definition = notificationDefinitionOf(claim.type);
    const { data } = claim;
    if (!definition.isData(data)) {
      this.logger.error(
        { event: "notification.render_failed", reason: "invalid_data", notificationId: claim.id, type: claim.type },
        "A notification's stored data no longer matches its type; it will not be sent",
      );
      return "invalid_data";
    }
    try {
      const byLocale = new Map<NotificationLocale, RenderedNotification>();
      const copyFor = (locale: NotificationLocale): RenderedNotification => {
        const cached = byLocale.get(locale);
        if (cached) return cached;
        const rendered = definition.render(data, locale);
        byLocale.set(locale, rendered);
        return rendered;
      };
      return {
        claim,
        devices: devices.map((device) => ({ ...device, rendered: copyFor(resolveNotificationLocale(device.locale)) })),
        channel: definition.channel,
        ttlSeconds: definition.ttlSeconds,
      };
    } catch (error) {
      this.logger.error(
        {
          err: error as Error,
          event: "notification.render_failed",
          reason: "render_failed",
          notificationId: claim.id,
          type: claim.type,
        },
        "A notification's data does not render; it will not be sent",
      );
      return "render_failed";
    }
  }

  private async sendChunk(chunk: Outgoing[], result: SendRunResult): Promise<void> {
    const messages: ExpoPushMessage[] = chunk.flatMap(({ claim, devices, channel, ttlSeconds }) =>
      devices.map(({ token, rendered }) => ({
        to: token,
        title: rendered.title,
        body: rendered.body,
        sound: "default" as const,
        channelId: channel,
        ...(ttlSeconds === undefined ? {} : { ttl: ttlSeconds }),
        data: { url: rendered.url, type: claim.type, notificationId: claim.id },
      })),
    );

    const answers = await this.sendMessages(messages);

    const outcomes: Outcome[] = [];
    const credentialErrors: { code: string; platform: DevicePlatform | null }[] = [];
    let offset = 0;
    for (const { claim, devices } of chunk) {
      const own = answers.slice(offset, offset + devices.length);
      offset += devices.length;

      const unanswered = own.filter((answer) => answer.status === "request_failed");
      if (unanswered.length > 0 && !own.some((answer) => answer.status === "ok")) {
        // Expo refused or did not answer the request: nothing is known to be sent.
        const [{ reason, retryAfterSeconds }] = unanswered;
        outcomes.push(this.retryOrGiveUp(claim, reason, retryAfterSeconds));
        continue;
      }

      const invalidDeviceIds: string[] = [];
      const deliveries = devices.flatMap((device, index): Prisma.NotificationDeliveryCreateManyInput[] => {
        const ticket = own[index];
        // Only after a split request, where another part was answered: this phone misses it.
        if (ticket.status === "request_failed") return [];
        if (ticket.status === "ok") {
          return [
            {
              notificationId: claim.id,
              deviceId: device.id,
              status: NotificationDeliveryStatus.TICKETED,
              ticketId: ticket.id,
            },
          ];
        }
        const code = errorCode(ticket);
        if (code === EXPO_DEVICE_NOT_REGISTERED) invalidDeviceIds.push(device.id);
        if (EXPO_CREDENTIAL_ERRORS.includes(code)) credentialErrors.push({ code, platform: device.platform });
        return [
          {
            notificationId: claim.id,
            deviceId: device.id,
            status: NotificationDeliveryStatus.FAILED,
            error: code,
          },
        ];
      });
      const accepted = deliveries.filter((delivery) => delivery.status === NotificationDeliveryStatus.TICKETED).length;
      const firstError = deliveries.find((delivery) => delivery.error)?.error ?? null;
      if (accepted === 0 && deliveries.some((delivery) => delivery.error === EXPO_MESSAGE_RATE_EXCEEDED)) {
        // Too fast for a phone, not a refusal: try the notification again later.
        outcomes.push({
          ...this.retryOrGiveUp(claim, EXPO_MESSAGE_RATE_EXCEEDED),
          deliveries,
          invalidDeviceIds,
          devices: devices.length,
          accepted,
        });
        continue;
      }
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
    this.alertCredentials("ticket", credentialErrors);
    await this.settle(outcomes, result);
  }

  /**
   * Sends messages in one Expo request and answers each one in order. A 400
   * on a request of several messages is one bad message failing them all, so
   * it is split in halves until the bad one is alone; that one gets an error
   * ticket with Expo's code and the rest go out. A 429, a 5xx or no answer
   * fails the whole request, to be retried; a 429 also pauses claiming.
   */
  private async sendMessages(messages: ExpoPushMessage[]): Promise<Answer[]> {
    try {
      return await this.expo.send(messages);
    } catch (error) {
      if (!(error instanceof ExpoPushRequestError)) throw error;
      const split = error.status === 400 && messages.length > 1;
      this.logger.warn(
        {
          err: error,
          event: "notification.expo.request_failed",
          status: error.status,
          messages: messages.length,
          ...(split ? { split: true } : {}),
        },
        split
          ? "Expo refused a push request; it is split to find the message it refused"
          : "Expo refused or did not answer a push request; the notifications in it are retried",
      );
      if (split) {
        const half = Math.ceil(messages.length / 2);
        return [
          ...(await this.sendMessages(messages.slice(0, half))),
          ...(await this.sendMessages(messages.slice(half))),
        ];
      }
      if (error.status === 400) {
        return [{ status: "error", message: error.message, details: { error: error.code ?? "http_400" } }];
      }
      const retryAfterSeconds =
        error.retryAfterSeconds === null ? 0 : Math.min(error.retryAfterSeconds, NOTIFICATION_RETRY_MAX_SECONDS);
      if (error.status === 429) {
        this.pausedUntil = Date.now() + Math.max(retryAfterSeconds, NOTIFICATION_RETRY_BASE_SECONDS) * 1000;
      }
      const failed: Answer = {
        status: "request_failed",
        reason: error.status ? `http_${error.status}` : "network",
        retryAfterSeconds,
      };
      return messages.map(() => failed);
    }
  }

  /**
   * Apple or Google refused our credentials, so every push on that platform
   * fails: one error line per request or receipt page, never per message.
   */
  private alertCredentials(
    source: "ticket" | "receipt",
    errors: { code: string; platform: DevicePlatform | null }[],
  ): void {
    if (errors.length === 0) return;
    const codes: Record<string, number> = {};
    for (const { code } of errors) codes[code] = (codes[code] ?? 0) + 1;
    const platforms = [...new Set(errors.map(({ platform }) => platform).filter((platform) => platform !== null))];
    this.logger.error(
      {
        event: ALERT_EVENTS.NOTIFICATION_CREDENTIALS_INVALID,
        severity: ALERT_SEVERITY.TICKET,
        source,
        messages: errors.length,
        codes,
        ...(platforms.length > 0 ? { platforms } : {}),
      },
      "Apple or Google refused our push credentials: pushes to these phones fail until they are fixed in EAS",
    );
  }

  /**
   * Back to PENDING with a backoff, or FAILED once the attempts are used up.
   * `minDelaySeconds` is Expo's Retry-After, when it sent one.
   */
  private retryOrGiveUp(claim: ClaimedNotification, reason: string, minDelaySeconds = 0): Outcome {
    if (claim.attempts >= this.maxAttempts()) return { claim, kind: "given_up", reason };
    const delaySeconds = Math.max(retryDelaySeconds(claim.attempts), minDelaySeconds);
    return { claim, kind: "retried", reason, nextAttemptAt: new Date(Date.now() + delaySeconds * 1000) };
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
    const run = await runExclusively(this.prisma, RECEIPTS_LOCK_KEY, RECEIPTS_LOCK_TIMEOUT_MS, () =>
      this.checkReceiptsNow(now),
    );
    return run.ran ? run.result : { ...emptyReceiptResult(), ranElsewhere: true };
  }

  private async checkReceiptsNow(now: Date): Promise<ReceiptRunResult> {
    const result = emptyReceiptResult();
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
      const credentialErrors: { code: string; platform: null }[] = [];
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
        if (EXPO_CREDENTIAL_ERRORS.includes(code)) credentialErrors.push({ code, platform: null });
      }
      this.alertCredentials("receipt", credentialErrors);
      // Not resent: the notification is SENT and its other phones have it, and
      // resending one phone's copy would need per-phone retries the outbox does
      // not have. Rare at our volume; the warning shows if that changes.
      const rateLimited = failedByCode.get(EXPO_MESSAGE_RATE_EXCEEDED)?.length ?? 0;
      if (rateLimited > 0) {
        result.rateLimited += rateLimited;
        this.logger.warn(
          { event: "notification.receipt.rate_limited", deliveries: rateLimited },
          "Apple or Google refused pushes sent too fast to the same phone; they are not resent",
        );
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

  /**
   * Deletes notifications past retention, with their deliveries, and phones
   * not seen for months. One replica at a time, like receipts.
   */
  async purgeExpired(now: Date = new Date()): Promise<RetentionRunResult> {
    const run = await runExclusively(this.prisma, RETENTION_LOCK_KEY, RETENTION_LOCK_TIMEOUT_MS, () =>
      this.purgeExpiredNow(now),
    );
    return run.ran ? run.result : { notifications: 0, devices: 0, ranElsewhere: true };
  }

  private async purgeExpiredNow(now: Date): Promise<RetentionRunResult> {
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
    return this.configService.get<number>("notifications.maxAttempts") ?? DEFAULT_NOTIFICATION_MAX_ATTEMPTS;
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
