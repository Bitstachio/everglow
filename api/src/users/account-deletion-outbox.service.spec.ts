import { Test } from "@nestjs/testing";
import { AccountDeletionOutboxAction, PrismaClient } from "generated/prisma/client";
import { DeepMockProxy, mockDeep } from "jest-mock-extended";
import { PinoLogger } from "nestjs-pino";
import { PhotoPurgeService } from "src/photos/photo-purge.service";
import { PrismaService } from "src/prisma/prisma.service";
import { AccountDeletionOutboxService } from "./account-deletion-outbox.service";
import { ACCOUNT_DELETION_OUTBOX_MAX_ATTEMPTS } from "./users.constants";

describe("AccountDeletionOutboxService", () => {
  let service: AccountDeletionOutboxService;
  let prisma: DeepMockProxy<PrismaClient>;
  let photoPurge: { purgeObjects: jest.Mock };
  let logger: { setContext: jest.Mock; error: jest.Mock };

  const userId = "11111111-1111-1111-1111-111111111111";
  const entry = (id: string, s3Key: string, attempts = 0) => ({ id, userId, s3Key, attempts });
  const purged = (failedKeys: string[] = []) => ({
    requested: 0,
    deleted: 0,
    failed: failedKeys.length,
    retained: 0,
    derivativesFailed: 0,
    failedKeys,
  });

  beforeEach(async () => {
    prisma = mockDeep<PrismaClient>();
    prisma.accountDeletionOutbox.findMany.mockResolvedValue([]);
    photoPurge = { purgeObjects: jest.fn().mockResolvedValue(purged()) };
    logger = { setContext: jest.fn(), error: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        AccountDeletionOutboxService,
        { provide: PrismaService, useValue: prisma },
        { provide: PhotoPurgeService, useValue: photoPurge },
        { provide: PinoLogger, useValue: logger },
      ],
    }).compile();
    service = module.get(AccountDeletionOutboxService);
  });

  describe("enqueuePurge", () => {
    it("writes one PURGE entry per key in the caller's transaction, once", async () => {
      await service.enqueuePurge(prisma, userId, ["photos/a", "photos/b", "photos/a"]);

      expect(prisma.accountDeletionOutbox.createMany).toHaveBeenCalledWith({
        data: [
          { userId, action: AccountDeletionOutboxAction.PURGE, s3Key: "photos/a" },
          { userId, action: AccountDeletionOutboxAction.PURGE, s3Key: "photos/b" },
        ],
        // A resumed prep queues the same keys again.
        skipDuplicates: true,
      });
    });

    it("writes nothing when there is nothing to purge", async () => {
      await service.enqueuePurge(prisma, userId, []);
      expect(prisma.accountDeletionOutbox.createMany).not.toHaveBeenCalled();
    });
  });

  describe("drain", () => {
    it("purges an account's entries and removes the ones that went", async () => {
      prisma.accountDeletionOutbox.findMany.mockResolvedValueOnce([
        entry("1", "photos/a"),
        entry("2", "avatars/u/x"),
      ] as never);

      await expect(service.drain({ userId })).resolves.toEqual({ done: 2, failed: 0, givenUp: 0 });

      expect(prisma.accountDeletionOutbox.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { action: AccountDeletionOutboxAction.PURGE, userId } }),
      );
      expect(photoPurge.purgeObjects).toHaveBeenCalledWith(["photos/a", "avatars/u/x"], {
        event: "user.account.photos_purged",
        userId,
      });
      expect(prisma.accountDeletionOutbox.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ["1", "2"] } } });
    });

    it("keeps what S3 refused, counted, for the next drain", async () => {
      prisma.accountDeletionOutbox.findMany.mockResolvedValueOnce([
        entry("1", "photos/a"),
        entry("2", "photos/b"),
      ] as never);
      photoPurge.purgeObjects.mockResolvedValue(purged(["photos/b"]));

      await expect(service.drain({ userId })).resolves.toEqual({ done: 1, failed: 1, givenUp: 0 });

      expect(prisma.accountDeletionOutbox.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ["1"] } } });
      expect(prisma.accountDeletionOutbox.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ["2"] } },
        data: { attempts: { increment: 1 } },
      });
    });

    it("leaves an entry that keeps failing to the S3 orphan reconciler", async () => {
      prisma.accountDeletionOutbox.findMany.mockResolvedValueOnce([
        entry("1", "photos/a", ACCOUNT_DELETION_OUTBOX_MAX_ATTEMPTS - 1),
      ] as never);
      photoPurge.purgeObjects.mockResolvedValue(purged(["photos/a"]));

      await expect(service.drain({ userId })).resolves.toEqual({ done: 0, failed: 0, givenUp: 1 });

      expect(prisma.accountDeletionOutbox.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ["1"] } } });
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ event: "user.account.deletion_outbox.given_up", entries: 1, userIds: [userId] }),
        expect.any(String),
      );
    });

    it("drains everything left behind before a time, for the reconciler", async () => {
      const createdBefore = new Date("2026-06-10T11:50:00.000Z");

      await service.drain({ createdBefore });

      expect(prisma.accountDeletionOutbox.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { action: AccountDeletionOutboxAction.PURGE, createdAt: { lt: createdBefore } },
        }),
      );
    });

    it("pages past a full batch without reading the same entries again", async () => {
      const full = Array.from({ length: 500 }, (_, i) => entry(String(i).padStart(4, "0"), `photos/${i}`));
      prisma.accountDeletionOutbox.findMany
        .mockResolvedValueOnce(full as never)
        .mockResolvedValueOnce([entry("9999", "photos/last")] as never);

      await expect(service.drain({ userId })).resolves.toMatchObject({ done: 501 });

      expect(prisma.accountDeletionOutbox.findMany).toHaveBeenLastCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ id: { gt: "0499" } }) as unknown }),
      );
    });

    it("never throws: a database failure is logged and left for the next drain", async () => {
      prisma.accountDeletionOutbox.findMany.mockRejectedValue(new Error("db down"));

      await expect(service.drain({ userId })).resolves.toEqual({ done: 0, failed: 0, givenUp: 0 });
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ event: "user.account.deletion_outbox.drain_failed", userId }),
        expect.any(String),
      );
    });
  });
});
