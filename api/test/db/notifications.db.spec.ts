/**
 * The notification outbox and device registration against a real Postgres:
 * the raw SQL every other suite mocks (the claim, FOR UPDATE SKIP LOCKED,
 * lease equality on timestamp(3), the advisory locks). Opt-in, and not in CI:
 *
 *   DB_TEST_DATABASE_URL=postgresql://…/everglow_dbtest pnpm run test:db
 *
 * Point it at an empty database with every migration applied (prisma migrate
 * deploy). It creates and deletes its own users, and refuses to start if the
 * database holds any other account, since the sender claims every due
 * notification in it. See docs/notifications.md §6.
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { randomUUID } from "crypto";
import { DevicePlatform, NotificationStatus, NotificationType, PrismaClient } from "generated/prisma/client";
import { DevicesService } from "src/notifications/devices.service";
import { claimDueNotifications } from "src/notifications/notification-claim";
import { NotificationSenderService, SendRunResult } from "src/notifications/notification-sender.service";
import { MAX_DEVICES_PER_USER } from "src/notifications/notifications.constants";

const url = process.env.DB_TEST_DATABASE_URL;
const SUB_PREFIX = "dbtest|";

if (!url) {
  console.warn(
    "Skipped the database suite: set DB_TEST_DATABASE_URL to an empty, migrated Postgres database to run it " +
      "(docs/notifications.md §6).",
  );
}
const describeDb = url ? describe : describe.skip;

const newClient = () => new PrismaClient({ adapter: new PrismaPg({ connectionString: url as string }) });
const quietLogger = () => ({
  setContext: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
});
const config = (overrides: Record<string, unknown> = {}) => ({
  get: (key: string) => ({ "notifications.senderEnabled": true, "notifications.maxAttempts": 8, ...overrides })[key],
});

/** Stands in for Expo: records every message, takes a moment so passes overlap, and accepts everything. */
const fakeExpo = (delayMs = 30) => {
  const sent: { to: string; notificationId: string }[] = [];
  return {
    sent,
    send: jest.fn(async (messages: { to: string; data: Record<string, string> }[]) => {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      for (const message of messages) sent.push({ to: message.to, notificationId: message.data.notificationId });
      return messages.map(() => ({ status: "ok", id: randomUUID() }));
    }),
    getReceipts: jest.fn(async (ids: string[]) => {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      return Object.fromEntries(ids.map((id) => [id, { status: "ok" }]));
    }),
  };
};

const senderOn = (client: PrismaClient, expo: ReturnType<typeof fakeExpo>) =>
  new NotificationSenderService(client as never, expo as never, config() as never, quietLogger() as never);

/** Moves every lease into the past, as if the pass holding it had died 6 minutes ago. */
const expireLeases = (client: PrismaClient) =>
  client.$executeRawUnsafe(
    `UPDATE "Notification" SET "claimedUntil" = "claimedUntil" - interval '6 minutes' WHERE "claimedUntil" IS NOT NULL`,
  );

describeDb("notifications against Postgres", () => {
  const a = newClient();
  const b = newClient();
  let userId: string;

  const createUser = async () => {
    const id = randomUUID();
    await a.user.create({ data: { id, providerSub: `${SUB_PREFIX}${id}` } });
    return id;
  };

  const cleanUp = () => a.user.deleteMany({ where: { providerSub: { startsWith: SUB_PREFIX } } });

  const queue = (n: number) =>
    a.notification.createMany({
      data: Array.from({ length: n }, (_, i) => ({
        userId,
        type: NotificationType.TEST,
        data: { nonce: `${i}` },
        dedupeKey: `test:${i}:${userId}`,
      })),
    });

  beforeAll(async () => {
    await Promise.all([a.$connect(), b.$connect()]);
    const others = await a.user.count({ where: { NOT: { providerSub: { startsWith: SUB_PREFIX } } } });
    if (others > 0) {
      throw new Error(
        `DB_TEST_DATABASE_URL holds ${others} other account(s). Point it at an empty, migrated database: ` +
          "this suite sends every due notification in it.",
      );
    }
  });

  afterAll(async () => {
    await cleanUp();
    await Promise.all([a.$disconnect(), b.$disconnect()]);
  });

  beforeEach(async () => {
    await cleanUp();
    userId = await createUser();
    await a.userDevice.createMany({
      data: [1, 2].map((i) => ({ userId, token: `ExponentPushToken[t${i}]`, platform: DevicePlatform.IOS })),
    });
  });

  describe("the sender", () => {
    it("never lets two instances on separate pools claim or send the same notification", async () => {
      await queue(400);
      const expoA = fakeExpo();
      const expoB = fakeExpo();

      const [ra, rb] = await Promise.all([senderOn(a, expoA).sendPending(), senderOn(b, expoB).sendPending()]);

      const perNotification = new Map<string, number>();
      for (const { notificationId } of [...expoA.sent, ...expoB.sent]) {
        perNotification.set(notificationId, (perNotification.get(notificationId) ?? 0) + 1);
      }
      expect(ra.claimed).toBeGreaterThan(0);
      expect(rb.claimed).toBeGreaterThan(0);
      expect(ra.claimed + rb.claimed).toBe(400);
      expect(perNotification.size).toBe(400);
      expect([...perNotification.values()].every((messages) => messages === 2)).toBe(true);
      // Every settle matched its lease to the millisecond (timestamp(3)) and released it.
      expect(ra.leaseLost + rb.leaseLost).toBe(0);
      expect(await a.notification.count({ where: { status: NotificationStatus.SENT, claimedUntil: null } })).toBe(400);
      expect(await a.notificationDelivery.count()).toBe(800);
    });

    it("leaves a crashed pass's claims alone until the lease runs out, then sends them once", async () => {
      await queue(3);
      expect(await claimDueNotifications(a, 50)).toHaveLength(3); // A pass claims, then dies.
      const expo = fakeExpo(0);
      const sender = senderOn(b, expo);

      expect((await sender.sendPending()).claimed).toBe(0);

      await expireLeases(a);
      const result = await sender.sendPending();

      expect(result).toMatchObject({ claimed: 3, sent: 3, leaseLost: 0 });
      const rows = await a.notification.findMany({ select: { status: true, attempts: true, claimedUntil: true } });
      expect(rows).toEqual(Array(3).fill({ status: NotificationStatus.SENT, attempts: 2, claimedUntil: null }));
      expect(await a.notificationDelivery.count()).toBe(6);
    });

    it("writes no deliveries and counts nothing for a pass whose lease another pass took over", async () => {
      await queue(1);
      const [stale] = await claimDueNotifications(a, 50);
      await expireLeases(a);
      const expo = fakeExpo(0);
      await senderOn(b, expo).sendPending(); // Takes the row over and sends it.

      // The old pass wakes up and finishes its batch.
      const late = senderOn(a, expo) as unknown as {
        sendBatch: (claimed: unknown[], result: SendRunResult) => Promise<void>;
      };
      const result: SendRunResult = {
        claimed: 1,
        sent: 0,
        failed: 0,
        skipped: 0,
        retried: 0,
        givenUp: 0,
        invalidatedDevices: 0,
        leaseLost: 0,
      };
      await late.sendBatch([stale], result);

      expect(result).toMatchObject({ sent: 0, leaseLost: 1 });
      expect(await a.notificationDelivery.count()).toBe(2);
      expect(await a.notification.findFirstOrThrow()).toMatchObject({ status: NotificationStatus.SENT, attempts: 2 });
    });

    it("runs receipts on one instance at a time", async () => {
      await queue(1);
      await senderOn(a, fakeExpo(0)).sendPending();
      await a.$executeRawUnsafe(`UPDATE "NotificationDelivery" SET "createdAt" = now() - interval '20 minutes'`);
      const expoA = fakeExpo(300);
      const expoB = fakeExpo(300);

      const results = await Promise.all([senderOn(a, expoA).checkReceipts(), senderOn(b, expoB).checkReceipts()]);

      expect(results.filter((result) => result.ranElsewhere)).toHaveLength(1);
      expect(expoA.getReceipts.mock.calls.length + expoB.getReceipts.mock.calls.length).toBe(1);
      expect(results.map((result) => result.delivered).sort()).toEqual([0, 2]);
    });
  });

  describe("device registration", () => {
    it(`keeps exactly ${MAX_DEVICES_PER_USER} phones when new ones register concurrently`, async () => {
      await a.userDevice.createMany({
        data: Array.from({ length: 6 }, (_, i) => ({
          userId,
          token: `ExponentPushToken[old${i}]`,
          platform: DevicePlatform.IOS,
        })),
      });
      const extra = [newClient(), newClient(), newClient(), newClient()];
      const clients = [a, b, ...extra];

      try {
        const results = await Promise.allSettled(
          clients.map((client, i) =>
            new DevicesService(client as never, quietLogger() as never).register(userId, {
              token: `ExponentPushToken[new${i}]`,
              platform: DevicePlatform.ANDROID,
            }),
          ),
        );

        expect(results.filter((settled) => settled.status === "rejected")).toEqual([]);
        expect(await a.userDevice.count({ where: { userId } })).toBe(MAX_DEVICES_PER_USER);
      } finally {
        await Promise.all(extra.map((client) => client.$disconnect()));
      }
    });

    it("moves one token between accounts registering it at once, without an error", async () => {
      const otherId = await createUser();
      const token = "ExponentPushToken[shared]";

      const results = await Promise.allSettled(
        Array.from({ length: 10 }, (_, i) =>
          new DevicesService((i % 2 ? a : b) as never, quietLogger() as never).register(i % 3 ? userId : otherId, {
            token,
            platform: DevicePlatform.ANDROID,
          }),
        ),
      );

      expect(results.filter((settled) => settled.status === "rejected")).toEqual([]);
      expect(await a.userDevice.count({ where: { token } })).toBe(1);
    });
  });
});
