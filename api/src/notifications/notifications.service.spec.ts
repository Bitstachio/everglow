import { Test, TestingModule } from "@nestjs/testing";
import { NotificationType, PrismaClient } from "generated/prisma/client";
import { DeepMockProxy, mockDeep } from "jest-mock-extended";
import { PrismaService } from "src/prisma/prisma.service";
import { NOTIFICATION_CATALOGUE } from "./notification-catalogue";
import { NotificationPreferencesService } from "./notification-preferences.service";
import { NotificationSenderService } from "./notification-sender.service";
import { NotificationsService } from "./notifications.service";

describe("NotificationsService", () => {
  let service: NotificationsService;
  let prisma: DeepMockProxy<PrismaClient>;
  let preferences: { filterRecipients: jest.Mock };
  let sender: { kick: jest.Mock };

  const alice = "11111111-1111-1111-1111-111111111111";
  const bob = "22222222-2222-2222-2222-222222222222";

  beforeEach(async () => {
    prisma = mockDeep<PrismaClient>();
    preferences = { filterRecipients: jest.fn((_tx, _type, userIds: string[]) => Promise.resolve(userIds)) };
    sender = { kick: jest.fn() };
    prisma.$transaction.mockImplementation(async (fn) => (fn as (tx: unknown) => Promise<unknown>)(prisma));
    prisma.notification.createMany.mockResolvedValue({ count: 2 });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationPreferencesService, useValue: preferences },
        { provide: NotificationSenderService, useValue: sender },
      ],
    }).compile();
    service = module.get(NotificationsService);
  });

  describe("notify", () => {
    it("queues one row per distinct recipient in the caller's transaction, deduped by key", async () => {
      const count = await service.notify(prisma, NotificationType.TEST, [alice, bob, alice], { nonce: "n1" });

      expect(count).toBe(2);
      expect(prisma.notification.createMany).toHaveBeenCalledWith({
        data: [
          { userId: alice, type: NotificationType.TEST, data: { nonce: "n1" }, dedupeKey: `test:n1:${alice}` },
          { userId: bob, type: NotificationType.TEST, data: { nonce: "n1" }, dedupeKey: `test:n1:${bob}` },
        ],
        skipDuplicates: true,
      });
      expect(sender.kick).not.toHaveBeenCalled();
    });

    it("leaves out people the preference check drops", async () => {
      preferences.filterRecipients.mockResolvedValue([bob]);

      await service.notify(prisma, NotificationType.TEST, [alice, bob], { nonce: "n1" });

      expect(prisma.notification.createMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: [expect.objectContaining({ userId: bob })] }),
      );
    });

    it("writes nothing when nobody is left", async () => {
      preferences.filterRecipients.mockResolvedValue([]);

      expect(await service.notify(prisma, NotificationType.TEST, [alice], { nonce: "n1" })).toBe(0);
      expect(await service.notify(prisma, NotificationType.TEST, [], { nonce: "n1" })).toBe(0);
      expect(prisma.notification.createMany).not.toHaveBeenCalled();
    });

    it("skips the preference check for required types", async () => {
      const original = NOTIFICATION_CATALOGUE.TEST.required;
      NOTIFICATION_CATALOGUE.TEST.required = true;
      try {
        await service.notify(prisma, NotificationType.TEST, [alice], { nonce: "n1" });
      } finally {
        NOTIFICATION_CATALOGUE.TEST.required = original;
      }

      expect(preferences.filterRecipients).not.toHaveBeenCalled();
      expect(prisma.notification.createMany).toHaveBeenCalled();
    });
  });

  describe("notifyNow", () => {
    it("queues in its own transaction, then kicks the sender", async () => {
      await service.notifyNow(NotificationType.TEST, [alice], { nonce: "n1" });

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(sender.kick).toHaveBeenCalledTimes(1);
    });

    it("does not kick when nothing new was queued", async () => {
      prisma.notification.createMany.mockResolvedValue({ count: 0 });

      await service.notifyNow(NotificationType.TEST, [alice], { nonce: "n1" });

      expect(sender.kick).not.toHaveBeenCalled();
    });
  });
});
