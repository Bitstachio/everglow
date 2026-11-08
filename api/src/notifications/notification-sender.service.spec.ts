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
import { NOTIFICATION_CATALOGUE } from "./notification-catalogue";
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
  const phoneA = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", token: "ExponentPushToken[a]", platform: "IOS" };
  const phoneB = { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", token: "ExponentPushToken[b]", platform: "ANDROID" };

  const claim = (overrides: Partial<ClaimedNotification> = {}): ClaimedNotification => ({
    id: "99999999-9999-4999-8999-999999999999",
    userId,
    type: NotificationType.TEST,
    data: { nonce: "n1" },
    attempts: 1,
    claimedUntil: lease,
    ...overrides,
  });

  const withUser = (devices: object[] = [phoneA], deletionStartedAt: Date | null = null) =>
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

  // Puts back catalogue entries a test replaced.
  afterEach(() => jest.restoreAllMocks());

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

    it("posts to the type's Android channel and sends no ttl when the type has none", async () => {
      claimOnce(claim());
      withUser();
      expo.send.mockResolvedValue([{ status: "ok", id: "ticket-a" }]);

      await service.sendPending();

      const [[message]] = expo.send.mock.calls[0] as [Record<string, unknown>[]];
      expect(message.channelId).toBe("account");
      expect(message).not.toHaveProperty("ttl");
    });

    it("sends the type's ttl when it has one", async () => {
      jest.replaceProperty(NOTIFICATION_CATALOGUE, "TEST", { ...NOTIFICATION_CATALOGUE.TEST, ttlSeconds: 3600 });
      claimOnce(claim());
      withUser();
      expo.send.mockResolvedValue([{ status: "ok", id: "ticket-a" }]);

      await service.sendPending();

      const [[message]] = expo.send.mock.calls[0] as [Record<string, unknown>[]];
      expect(message.ttl).toBe(3600);
    });

    it("renders once per language, falling back to English for a language with no copy", async () => {
      const render = jest.fn(NOTIFICATION_CATALOGUE.TEST.render);
      jest.replaceProperty(NOTIFICATION_CATALOGUE, "TEST", { ...NOTIFICATION_CATALOGUE.TEST, render });
      claimOnce(claim());
      withUser([
        { ...phoneA, locale: "fr-CA" },
        { ...phoneB, locale: "en-CA" },
      ]);
      expo.send.mockResolvedValue([
        { status: "ok", id: "ticket-a" },
        { status: "ok", id: "ticket-b" },
      ]);

      await service.sendPending();

      expect(render).toHaveBeenCalledTimes(1);
      expect(render).toHaveBeenCalledWith({ nonce: "n1" }, "en");
      const [messages] = expo.send.mock.calls[0] as [{ body: string }[]];
      expect(messages[0].body).toBe(messages[1].body);
    });

    it("FAILs a notification whose stored data no longer matches its type, without sending it", async () => {
      claimOnce(claim({ data: { nonce: 42 } }));
      withUser();

      const result = await service.sendPending();

      expect(expo.send).not.toHaveBeenCalled();
      expect(settledAs()).toMatchObject({ status: NotificationStatus.FAILED, lastError: "invalid_data" });
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ event: "notification.render_failed", reason: "invalid_data" }),
        expect.any(String),
      );
      expect(result).toMatchObject({ failed: 1 });
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

    it("raises one credentials alert per request when Apple or Google refuse our credentials", async () => {
      claimOnce(claim());
      withUser([phoneA, phoneB]);
      expo.send.mockResolvedValue([
        { status: "error", message: "bad key", details: { error: "InvalidCredentials" } },
        { status: "error", message: "wrong sender", details: { error: "MismatchSenderId" } },
      ]);

      await service.sendPending();

      expect(logger.error).toHaveBeenCalledTimes(1);
      expect(logger.error).toHaveBeenCalledWith(
        {
          event: ALERT_EVENTS.NOTIFICATION_CREDENTIALS_INVALID,
          severity: "ticket",
          source: "ticket",
          messages: 2,
          codes: { InvalidCredentials: 1, MismatchSenderId: 1 },
          platforms: ["IOS", "ANDROID"],
        },
        expect.any(String),
      );
      expect(JSON.stringify(logger.error.mock.calls)).not.toContain(phoneA.token);
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

    it("splits a request Expo refuses with a 400 until only the bad message fails", async () => {
      const good1 = claim({ id: "11111111-0000-4000-8000-000000000001" });
      const bad = claim({ id: "11111111-0000-4000-8000-000000000002" });
      const good2 = claim({ id: "11111111-0000-4000-8000-000000000003" });
      claimOnce(good1, bad, good2);
      withUser([phoneA]);
      expo.send.mockImplementation((messages: { data: { notificationId: string } }[]) =>
        messages.some((message) => message.data.notificationId === bad.id)
          ? Promise.reject(new ExpoPushRequestError("invalid", 400, null, "VALIDATION_ERROR"))
          : Promise.resolve(messages.map((message) => ({ status: "ok", id: `t-${message.data.notificationId}` }))),
      );

      const result = await service.sendPending();

      // [g1, bad, g2] -> [g1, bad] -> [g1], [bad]; then [g2].
      expect(expo.send.mock.calls.map(([messages]) => (messages as unknown[]).length)).toEqual([3, 2, 1, 1, 1]);
      expect(settledAs(good1.id)).toMatchObject({ status: NotificationStatus.SENT });
      expect(settledAs(good2.id)).toMatchObject({ status: NotificationStatus.SENT });
      expect(settledAs(bad.id)).toMatchObject({ status: NotificationStatus.FAILED, lastError: "VALIDATION_ERROR" });
      expect(result).toMatchObject({ sent: 2, failed: 1, retried: 0, givenUp: 0 });
    });

    it("retries the whole request on a 5xx, without splitting it", async () => {
      claimOnce(
        claim({ id: "11111111-0000-4000-8000-000000000001" }),
        claim({ id: "11111111-0000-4000-8000-000000000002" }),
      );
      withUser([phoneA]);
      expo.send.mockRejectedValue(new ExpoPushRequestError("down", 502));

      const result = await service.sendPending();

      expect(expo.send).toHaveBeenCalledTimes(1);
      expect(result).toMatchObject({ retried: 2 });
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

    it("waits for the run a call during the last one asked for, before saying it is idle", async () => {
      prisma.$queryRaw.mockResolvedValue([] as never);

      void service.sendPending();
      void service.sendPending(); // Joins, and asks for one more run.
      await service.whenIdle();

      expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
      await expect(service.whenIdle()).resolves.toBeUndefined();
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

    // pg_try_advisory_xact_lock: this replica gets the run.
    beforeEach(() => prisma.$queryRaw.mockResolvedValue([{ locked: true }] as never));

    it("does nothing while another replica holds the receipts lock", async () => {
      prisma.$queryRaw.mockResolvedValue([{ locked: false }] as never);

      const result = await service.checkReceipts(now);

      expect(prisma.notificationDelivery.findMany).not.toHaveBeenCalled();
      expect(expo.getReceipts).not.toHaveBeenCalled();
      expect(result).toMatchObject({ checked: 0, ranElsewhere: true });
      const [strings, key] = prisma.$queryRaw.mock.calls[0] as unknown as [TemplateStringsArray, string];
      expect(strings.join("?")).toContain("pg_try_advisory_xact_lock");
      expect(key).toBe("notifications:receipts");
    });

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

    it("raises the credentials alert for receipts that say our credentials are broken", async () => {
      prisma.notificationDelivery.findMany.mockResolvedValueOnce([
        { id: "d1", ticketId: "t1", deviceId: phoneA.id },
        { id: "d2", ticketId: "t2", deviceId: phoneB.id },
      ] as never);
      expo.getReceipts.mockResolvedValue({
        t1: { status: "error", message: "bad key", details: { error: "InvalidCredentials" } },
        t2: { status: "error", message: "bad key", details: { error: "InvalidCredentials" } },
      });

      await service.checkReceipts(now);

      expect(logger.error).toHaveBeenCalledTimes(1);
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          event: ALERT_EVENTS.NOTIFICATION_CREDENTIALS_INVALID,
          source: "receipt",
          messages: 2,
          codes: { InvalidCredentials: 2 },
        }),
        expect.any(String),
      );
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
    beforeEach(() => prisma.$queryRaw.mockResolvedValue([{ locked: true }] as never));

    it("does nothing while another replica holds the retention lock", async () => {
      prisma.$queryRaw.mockResolvedValue([{ locked: false }] as never);

      const result = await service.purgeExpired();

      expect(prisma.notification.deleteMany).not.toHaveBeenCalled();
      expect(result).toEqual({ notifications: 0, devices: 0, ranElsewhere: true });
    });

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
