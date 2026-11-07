/**
 * Sends a TEST notification to every phone one account has registered, then
 * prints what Expo said. Checks the whole path: device registration, the
 * outbox, the sender and Expo (docs/notifications.md §6).
 *
 * Usage (from api/, against the database in .env):
 *   pnpm run notifications:send-test -- <username or user id>
 *
 * Sends for real through Expo. Point it only at your own account.
 */

import { randomUUID } from "crypto";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const main = async (): Promise<void> => {
  const target = process.argv[2]?.replace(/^@/, "");
  if (!target) {
    console.error("Usage: pnpm run notifications:send-test -- <username or user id>");
    process.exit(1);
  }

  const { NestFactory } = await import("@nestjs/core");
  const { NotificationType } = await import("../generated/prisma/client");
  const { AppModule } = await import("../src/app.module");
  const { PrismaService } = await import("../src/prisma/prisma.service");
  const { NotificationsService } = await import("../src/notifications/notifications.service");
  const { NotificationSenderService } = await import("../src/notifications/notification-sender.service");

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ["error", "warn"] });
  try {
    const prisma = app.get(PrismaService);
    const sender = app.get(NotificationSenderService);
    if (!sender.isEnabled()) throw new Error("NOTIFICATIONS_SENDER_ENABLED is false: nothing would be sent.");

    const user = UUID.test(target)
      ? await prisma.user.findUnique({ where: { id: target }, select: { id: true } })
      : await prisma.userDetails
          .findUnique({ where: { username: target.toLowerCase() }, select: { userId: true } })
          .then((details) => (details ? { id: details.userId } : null));
    if (!user) throw new Error(`No account matches "${target}".`);

    const devices = await prisma.userDevice.count({ where: { userId: user.id } });
    console.log(`Account ${user.id}: ${devices} phone(s) registered.`);

    const nonce = randomUUID();
    await app.get(NotificationsService).notifyNow(NotificationType.TEST, [user.id], { nonce });
    const result = await sender.sendPending();
    console.log("Sender run:", result);

    const notification = await prisma.notification.findUnique({
      where: { dedupeKey: `test:${nonce}:${user.id}` },
      select: { id: true, status: true, lastError: true, deliveries: { select: { status: true, error: true } } },
    });
    console.log("Notification:", JSON.stringify(notification, null, 2));
    console.log("Receipts are checked from 15 minutes on, by the receipts job.");
  } finally {
    await app.close();
  }
};

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
