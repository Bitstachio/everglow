import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
import {
  NotificationDeliveryStatus,
  NotificationStatus,
  NotificationType,
  PrismaClient,
} from "generated/prisma/client";
import { DeepMockProxy, mockDeep } from "jest-mock-extended";
import { PinoLogger } from "nestjs-pino";
import { ALERT_EVENTS } from "src/common/logging/alert-events.constants";
import { PrismaService } from "src/prisma/prisma.service";
import { ExpoPushRequestError, ExpoPushService } from "src/sdk/expo/expo-push.service";
import { ClaimedNotification } from "./notification-claim";
import { DEFAULT_NOTIFICATION_MAX_ATTEMPTS } from "./notifications.constants";
import { NotificationSenderService, chunkByMessages, retryDelaySeconds } from "./notification-sender.service";

describe("NotificationSenderService", () => {
  let service: NotificationSenderService;
  let prisma: DeepMockProxy<PrismaClient>;
  let expo: { send: jest.Mock; getReceipts: jest.Mock };
  let config: Record<string, unknown>;
  let logger: { setContext: jest.Mock; info: jest.Mock; warn: jest.Mock; error: jest.Mock; debug: jest.Mock };

  const userId = "11111111-1111-1111-1111-111111111111";
  const lease = new Date("2026-11-05T12:05:00.000Z");
  const phoneA = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", token: "ExponentPushToken[a]" };
  const phoneB = { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", token: "ExponentPushToken[b]" };

  const claim = (overrides: Partial<ClaimedNotification> = {}): ClaimedNotification => ({
    id: "99999999-9999-4999-8999-999999999999",
    userId,
    type: NotificationType.TEST,
    data: { nonce: "n1" },
    attempts: 1,
    claimedUntil: lease,
    ...overrides,
  });

  const withUser = (devices = [phoneA], deletionStartedAt: Date | null = null) =>
    prisma.user.findMany.mockResolvedValue([{ id: userId, deletionStartedAt, devices }] as never);

  const claimOnce = (...claims: ClaimedNotification[]) =>
    prisma.$queryRaw.mockResolvedValueOnce(claims as never).mockResolvedValue([] as never);

  /** The data of the notification.updateMany that settled `id`. */
  const settledAs = (id = claim().id) =>
    prisma.notification.updateMany.mock.calls.find(([args]) => (args.where as { id: string }).id === id)?.[0].data;

  beforeEach(async () => {
    prisma = mockDeep<PrismaClient>();
    expo = { send: jest.fn(), getReceipts: jest.fn() };
    config = { "notifications.senderEnabled": true, "notifications.maxAttempts": 3 };
    logger = { setContext: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
    // Interactive transactions run on the same mock; array ones resolve their operations.
    prisma.$transaction.mockImplementation(((arg: unknown) =>
      typeof arg === "function"
        ? (arg as (tx: unknown) => Promise<unknown>)(prisma)
        : Promise.all(arg as unknown[])) as never);
    prisma.notification.updateMany.mockResolvedValue({ count: 1 });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationSenderService,
        { provide: PrismaService, useValue: prisma },
        { provide: ExpoPushService, useValue: expo },
        { provide: ConfigService, useValue: { get: (key: string) => config[key] } },
        { provide: PinoLogger, useValue: logger },
      ],
    }).compile();
    service = module.get(NotificationSenderService);
  });

  describe("sendPending", () => {
    it("sends one message per phone with the catalogue's copy and the link, and marks it SENT", async () => {
      claimOnce(claim());
      withUser([phoneA, phoneB]);
      expo.send.mockResolvedValue([
        { status: "ok", id: "ticket-a" },
        { status: "ok", id: "ticket-b" },
      ]);

      const result = await service.sendPending();

      expect(expo.send).toHaveBeenCalledWith([
        expect.objectContaining({
          to: phoneA.token,
          title: "Everglow",
          data: { url: "/", type: "TEST", notificationId: claim().id },
        }),
        expect.objectContaining({ to: phoneB.token }),
      ]);
      expect(prisma.notificationDelivery.createMany).toHaveBeenCalledWith({
        data: [
          {
            notificationId: claim().id,
            deviceId: phoneA.id,
            status: NotificationDeliveryStatus.TICKETED,
            ticketId: "ticket-a",
          },
          {
            notificationId: claim().id,
            deviceId: phoneB.id,
            status: NotificationDeliveryStatus.TICKETED,
            ticketId: "ticket-b",
          },
        ],
      });
      expect(prisma.notification.updateMany).toHaveBeenCalledWith({
        where: { id: claim().id, claimedUntil: lease },
        data: expect.objectContaining({ status: NotificationStatus.SENT, claimedUntil: null }) as object,
      });
      expect(result).toMatchObject({ claimed: 1, sent: 1, failed: 0 });
      expect(JSON.stringify(logger.info.mock.calls)).not.toContain(phoneA.token);
    });

    it("counts it SENT when one phone takes it, and unregisters a phone Expo says is gone", async () => {
      claimOnce(claim());
      withUser([phoneA, phoneB]);
      expo.send.mockResolvedValue([
        { status: "ok", id: "ticket-a" },
        { status: "error", message: "gone", details: { error: "DeviceNotRegistered" } },
      ]);

      const result = await service.sendPending();

      expect(settledAs()).toMatchObject({ status: NotificationStatus.SENT });
      expect(prisma.userDevice.deleteMany).toHaveBeenCalledWith({ where: { id: { in: [phoneB.id] } } });
      expect(result).toMatchObject({ sent: 1, invalidatedDevices: 1 });
    });

    it("marks it FAILED with the error when every phone refuses it", async () => {
      claimOnce(claim());
      withUser();
      expo.send.mockResolvedValue([{ status: "error", message: "big", details: { error: "MessageTooBig" } }]);

      const result = await service.sendPending();

      expect(settledAs()).toMatchObject({ status: NotificationStatus.FAILED, lastError: "MessageTooBig" });
      expect(result).toMatchObject({ failed: 1 });
    });

    it("skips an account with no phones without calling Expo", async () => {
      claimOnce(claim());
      withUser([]);

      const result = await service.sendPending();

      expect(expo.send).not.toHaveBeenCalled();
      expect(settledAs()).toMatchObject({ status: NotificationStatus.SKIPPED, lastError: "no_devices" });
      expect(result).toMatchObject({ skipped: 1 });
    });

    it("sends nothing to an account whose deletion has started", async () => {
      claimOnce(claim());
      withUser([phoneA], new Date());

      await service.sendPending();

      expect(expo.send).not.toHaveBeenCalled();
      expect(settledAs()).toMatchObject({ status: NotificationStatus.SKIPPED, lastError: "account_deleting" });
    });

    it("puts it back with a backoff when Expo does not answer", async () => {
      claimOnce(claim({ attempts: 2 }));
      withUser();
      expo.send.mockRejectedValue(new ExpoPushRequestError("down", 503));

      const before = Date.now();
      const result = await service.sendPending();

      const data = settledAs() as { claimedUntil: null; lastError: string; nextAttemptAt: Date };
      expect(data).toMatchObject({ claimedUntil: null, lastError: "http_503" });
      expect(data.nextAttemptAt.getTime()).toBeGreaterThanOrEqual(before + retryDelaySeconds(2) * 1000);
      expect(result).toMatchObject({ retried: 1, givenUp: 0 });
      expect(prisma.notificationDelivery.createMany).not.toHaveBeenCalled();
    });

    it("waits at least Expo's Retry-After on a 429, and claims no more batches this run", async () => {
      claimOnce(claim({ attempts: 1 }));
      withUser();
      expo.send.mockRejectedValue(new ExpoPushRequestError("slow down", 429, 600));

      const before = Date.now();
      const result = await service.sendPending();

      const data = settledAs() as { lastError: string; nextAttemptAt: Date };
      expect(data.lastError).toBe("http_429");
      expect(data.nextAttemptAt.getTime()).toBeGreaterThanOrEqual(before + 600_000);
      expect(result).toMatchObject({ retried: 1 });

      prisma.$queryRaw.mockClear();
      await service.sendPending();
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
    });

    it("caps a Retry-After at the longest backoff", async () => {
      claimOnce(claim({ attempts: 1 }));
      withUser();
      expo.send.mockRejectedValue(new ExpoPushRequestError("slow down", 429, 86_400));

      const before = Date.now();
      await service.sendPending();

      const data = settledAs() as { nextAttemptAt: Date };
      expect(data.nextAttemptAt.getTime()).toBeLessThanOrEqual(before + 3600_000 + 1000);
    });

    it("retries a notification every phone refused only for sending too fast", async () => {
      claimOnce(claim({ attempts: 1 }));
      withUser([phoneA, phoneB]);
      expo.send.mockResolvedValue([
        { status: "error", message: "slow down", details: { error: "MessageRateExceeded" } },
        { status: "error", message: "gone", details: { error: "DeviceNotRegistered" } },
      ]);

      const result = await service.sendPending();

      expect(settledAs()).toMatchObject({ claimedUntil: null, lastError: "MessageRateExceeded" });
      expect(settledAs()).not.toHaveProperty("status");
      expect(prisma.userDevice.deleteMany).toHaveBeenCalledWith({ where: { id: { in: [phoneB.id] } } });
      expect(result).toMatchObject({ retried: 1, failed: 0, sent: 0 });
    });

    it("gives up after the last attempt and raises the alert", async () => {
      claimOnce(claim({ attempts: 3 }));
      withUser();
      expo.send.mockRejectedValue(new ExpoPushRequestError("timeout", null));

      const result = await service.sendPending();

      expect(settledAs()).toMatchObject({ status: NotificationStatus.FAILED, lastError: "network" });
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ event: ALERT_EVENTS.NOTIFICATION_GIVEN_UP, severity: "ticket" }),
        expect.any(String),
      );
      expect(result).toMatchObject({ givenUp: 1 });
    });

    it("does not send again a notification claimed past its attempts, after passes that died", async () => {
      claimOnce(claim({ attempts: 4 }));
      withUser();

      await service.sendPending();

      expect(expo.send).not.toHaveBeenCalled();
      expect(settledAs()).toMatchObject({ status: NotificationStatus.FAILED, lastError: "attempts_exhausted" });
    });

    it("writes nothing and counts nothing for a notification whose lease another pass took over", async () => {
      const lost = claim();
      const kept = claim({ id: "88888888-8888-4888-8888-888888888888" });
      claimOnce(lost, kept);
      withUser([phoneA, phoneB]);
      expo.send.mockResolvedValue([
        { status: "ok", id: "ticket-1" },
        { status: "error", message: "gone", details: { error: "DeviceNotRegistered" } },
        { status: "ok", id: "ticket-3" },
        { status: "ok", id: "ticket-4" },
      ]);
      prisma.notification.updateMany.mockImplementation(((args: { where: { id: string } }) =>
        Promise.resolve({ count: args.where.id === lost.id ? 0 : 1 })) as never);

      const result = await service.sendPending();

      // The status write comes first, and only the notification still held gets its deliveries.
      expect(prisma.notification.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
        prisma.notificationDelivery.createMany.mock.invocationCallOrder[0],
      );
      expect(prisma.notificationDelivery.createMany).toHaveBeenCalledTimes(1);
      expect(prisma.notificationDelivery.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({ notificationId: kept.id, ticketId: "ticket-3" }),
          expect.objectContaining({ notificationId: kept.id, ticketId: "ticket-4" }),
        ],
      });
      // The lost pass's DeviceNotRegistered is the new holder's to act on.
      expect(prisma.userDevice.deleteMany).not.toHaveBeenCalled();
      expect(result).toMatchObject({ sent: 1, leaseLost: 1, invalidatedDevices: 0 });
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ event: "notification.lease_lost", notificationId: lost.id }),
        expect.any(String),
      );
    });

    it("does not raise the given-up alert when the lease was lost", async () => {
      claimOnce(claim({ attempts: 3 }));
      withUser();
      expo.send.mockRejectedValue(new ExpoPushRequestError("down", 503));
      prisma.notification.updateMany.mockResolvedValue({ count: 0 });

      const result = await service.sendPending();

      expect(logger.error).not.toHaveBeenCalled();
      expect(result).toMatchObject({ givenUp: 0, leaseLost: 1 });
    });

    it("lets an unexpected error fail the run, leaving the claim to expire and be retried", async () => {
      claimOnce(claim());
      withUser();
      expo.send.mockRejectedValue(new TypeError("bug"));

      await expect(service.sendPending()).rejects.toThrow("bug");
      expect(prisma.notification.updateMany).not.toHaveBeenCalled();
    });

    it("runs once at a time: a second call joins the run in progress", async () => {
      prisma.$queryRaw.mockResolvedValue([] as never);

      const first = service.sendPending();
      const second = service.sendPending();

      expect(second).toBe(first);
      await first;
    });
  });

  describe("kick", () => {
    it("does nothing while the sender is disabled", () => {
      config["notifications.senderEnabled"] = false;

      service.kick();

      expect(prisma.$queryRaw).not.toHaveBeenCalled();
    });
  });

  describe("checkReceipts", () => {
    const now = new Date("2026-11-05T12:00:00.000Z");

    it("marks delivered and failed receipts and unregisters phones that are gone", async () => {
      prisma.notificationDelivery.findMany.mockResolvedValueOnce([
        { id: "d1", ticketId: "t1", deviceId: phoneA.id },
        { id: "d2", ticketId: "t2", deviceId: phoneB.id },
        { id: "d3", ticketId: "t3", deviceId: phoneA.id },
      ] as never);
      expo.getReceipts.mockResolvedValue({
        t1: { status: "ok" },
        t2: { status: "error", message: "gone", details: { error: "DeviceNotRegistered" } },
      });

      const result = await service.checkReceipts(now);

      expect(expo.getReceipts).toHaveBeenCalledWith(["t1", "t2", "t3"]);
      expect(prisma.notificationDelivery.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ["d1"] } },
        data: { status: NotificationDeliveryStatus.DELIVERED },
      });
      expect(prisma.notificationDelivery.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ["d2"] } },
        data: { status: NotificationDeliveryStatus.FAILED, error: "DeviceNotRegistered" },
      });
      expect(prisma.userDevice.deleteMany).toHaveBeenCalledWith({ where: { id: { in: [phoneB.id] } } });
      // t3 has no receipt yet: left TICKETED for the next run.
      expect(result).toEqual({ checked: 2, delivered: 1, failed: 1, invalidatedDevices: 1, rateLimited: 0 });
    });

    it("marks a rate-limited receipt FAILED and warns, without resending", async () => {
      prisma.notificationDelivery.findMany.mockResolvedValueOnce([
        { id: "d1", ticketId: "t1", deviceId: phoneA.id },
      ] as never);
      expo.getReceipts.mockResolvedValue({
        t1: { status: "error", message: "slow down", details: { error: "MessageRateExceeded" } },
      });

      const result = await service.checkReceipts(now);

      expect(prisma.notificationDelivery.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ["d1"] } },
        data: { status: NotificationDeliveryStatus.FAILED, error: "MessageRateExceeded" },
      });
      expect(prisma.notification.updateMany).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ event: "notification.receipt.rate_limited", deliveries: 1 }),
        expect.any(String),
      );
      expect(result).toMatchObject({ failed: 1, rateLimited: 1 });
    });

    it("only reads tickets old enough to have a receipt and young enough that Expo still has it", async () => {
      prisma.notificationDelivery.findMany.mockResolvedValue([]);

      await service.checkReceipts(now);

      expect(prisma.notificationDelivery.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: NotificationDeliveryStatus.TICKETED,
            createdAt: { lte: new Date("2026-11-05T11:45:00.000Z"), gte: new Date("2026-11-04T12:00:00.000Z") },
          }) as object,
        }),
      );
      expect(expo.getReceipts).not.toHaveBeenCalled();
    });
  });

  describe("purgeExpired", () => {
    it("deletes notifications past retention and phones not seen for months", async () => {
      config["notifications.retentionDays"] = 90;
      config["notifications.deviceStaleDays"] = 270;
      prisma.notification.deleteMany.mockResolvedValue({ count: 4 });
      prisma.userDevice.deleteMany.mockResolvedValue({ count: 1 });
      const now = new Date("2026-11-05T00:00:00.000Z");

      const result = await service.purgeExpired(now);

      expect(prisma.notification.deleteMany).toHaveBeenCalledWith({
        where: { createdAt: { lt: new Date("2026-08-07T00:00:00.000Z") } },
      });
      expect(prisma.userDevice.deleteMany).toHaveBeenCalledWith({
        where: { lastSeenAt: { lt: new Date("2026-02-08T00:00:00.000Z") } },
      });
      expect(result).toEqual({ notifications: 4, devices: 1 });
    });
  });
});

describe("retryDelaySeconds", () => {
  it("doubles from a minute and stops at an hour", () => {
    expect([1, 2, 3, 4, 5, 6, 7].map(retryDelaySeconds)).toEqual([60, 120, 240, 480, 960, 1920, 3600]);
    expect(retryDelaySeconds(20)).toBe(3600);
  });

  // docs/notifications.md §4 promises about 2 hours of retries. The waits
  // between the first and the last of the default attempts are that window.
  it("spreads the default attempts over about two hours", () => {
    const waits = Array.from({ length: DEFAULT_NOTIFICATION_MAX_ATTEMPTS - 1 }, (_, i) => retryDelaySeconds(i + 1));

    expect(DEFAULT_NOTIFICATION_MAX_ATTEMPTS).toBe(8);
    expect(waits.reduce((sum, wait) => sum + wait, 0)).toBe(123 * 60);
  });
});

describe("chunkByMessages", () => {
  const item = (devices: number) =>
    ({ devices: Array.from({ length: devices }, (_, i) => ({ id: `${i}`, token: `t${i}` })) }) as never;

  it("fills Expo requests up to 100 messages without splitting a notification", () => {
    const chunks = chunkByMessages([item(60), item(30), item(20), item(100)]);

    expect(chunks.map((chunk) => chunk.length)).toEqual([2, 1, 1]);
  });
});
