import { Test } from "@nestjs/testing";
import { AccountDeletionOutboxAction, PrismaClient } from "generated/prisma/client";
import { DeepMockProxy, mockDeep } from "jest-mock-extended";
import { PinoLogger } from "nestjs-pino";
import { PhotoPurgeService } from "src/photos/photo-purge.service";
import { PrismaService } from "src/prisma/prisma.service";
import { S3Service } from "src/sdk/aws/s3/s3.service";
import { AccountDeletionOutboxService } from "./account-deletion-outbox.service";
import { ACCOUNT_DELETION_OUTBOX_MAX_ATTEMPTS } from "./users.constants";

describe("AccountDeletionOutboxService", () => {
  let service: AccountDeletionOutboxService;
  let prisma: DeepMockProxy<PrismaClient>;
  let photoPurge: { purgeObjects: jest.Mock };
  let logger: { setContext: jest.Mock; error: jest.Mock; warn: jest.Mock };
  let s3Service: { copyObject: jest.Mock; headObject: jest.Mock; deleteObjects: jest.Mock };

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
    logger = { setContext: jest.fn(), error: jest.fn(), warn: jest.fn() };
    s3Service = {
      copyObject: jest.fn().mockResolvedValue({ sha256: null }),
      headObject: jest.fn().mockResolvedValue({ exists: true }),
      deleteObjects: jest.fn().mockImplementation((keys: string[]) => Promise.resolve({ deleted: keys, failed: [] })),
    };
    prisma.$transaction.mockImplementation(async (fn) => (fn as (tx: unknown) => Promise<unknown>)(prisma));

    const module = await Test.createTestingModule({
      providers: [
        AccountDeletionOutboxService,
        { provide: PrismaService, useValue: prisma },
        { provide: PhotoPurgeService, useValue: photoPurge },
        { provide: S3Service, useValue: s3Service },
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

      expect(prisma.accountDeletionOutbox.findMany).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ where: expect.objectContaining({ id: { gt: "0499" } }) as unknown }),
      );
    });

    describe("moving kept photos off their uploader's key", () => {
      const eventId = "66666666-6666-6666-6666-666666666666";
      const photoId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
      const from = `photos/${userId}/${eventId}/${photoId}`;
      const to = `photos/${eventId}/${photoId}`;
      const rekeyEntry = { id: "r1", userId, s3Key: from, photoId, targetS3Key: to, attempts: 0 };
      /** PURGE reads come back empty; the REKEY read returns the entry once. */
      const queueRekey = () =>
        prisma.accountDeletionOutbox.findMany.mockImplementation(((args: { where: { action: string; id?: unknown } }) =>
          Promise.resolve(args.where.action === "REKEY" && !args.where.id ? [rekeyEntry] : [])) as never);

      beforeEach(() => {
        queueRekey();
        prisma.photo.findUnique.mockResolvedValue({ s3Key: from } as never);
        prisma.photo.updateMany.mockResolvedValue({ count: 1 });
        prisma.reportEvidence.updateMany.mockResolvedValue({ count: 0 });
      });

      it("queues the move in the caller's transaction, to a key without the uploader", async () => {
        await service.enqueueRekey(prisma, userId, [{ id: photoId, eventId, s3Key: from }]);

        expect(prisma.accountDeletionOutbox.createMany).toHaveBeenCalledWith({
          data: [{ userId, action: AccountDeletionOutboxAction.REKEY, s3Key: from, photoId, targetS3Key: to }],
          skipDuplicates: true,
        });
      });

      it("copies the original and its renditions, points the row and its evidence at the copy, then deletes the old", async () => {
        await expect(service.drain({ userId })).resolves.toEqual({ done: 1, failed: 0, givenUp: 0 });

        expect(s3Service.copyObject).toHaveBeenNthCalledWith(1, from, to);
        expect(s3Service.copyObject).toHaveBeenNthCalledWith(
          2,
          `derived/${from}/thumb.webp`,
          `derived/${to}/thumb.webp`,
        );
        expect(s3Service.copyObject).toHaveBeenNthCalledWith(3, `derived/${from}/large.jpg`, `derived/${to}/large.jpg`);
        expect(prisma.photo.updateMany).toHaveBeenCalledWith({
          where: { id: photoId, s3Key: from },
          data: { s3Key: to },
        });
        expect(prisma.reportEvidence.updateMany).toHaveBeenCalledWith({
          where: { objectS3Key: from },
          data: { objectS3Key: to },
        });
        expect(s3Service.deleteObjects).toHaveBeenCalledWith([
          from,
          `derived/${from}/thumb.webp`,
          `derived/${from}/large.jpg`,
        ]);
        // The row names the copy before the original goes: the photo never stops being viewable.
        expect(s3Service.copyObject.mock.invocationCallOrder[0]).toBeLessThan(
          prisma.photo.updateMany.mock.invocationCallOrder[0],
        );
        expect(prisma.photo.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
          s3Service.deleteObjects.mock.invocationCallOrder[0],
        );
        expect(prisma.accountDeletionOutbox.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ["r1"] } } });
      });

      it("skips a rendition the image processor never wrote", async () => {
        s3Service.headObject.mockResolvedValue({ exists: false });

        await service.drain({ userId });

        expect(s3Service.copyObject).toHaveBeenCalledTimes(1);
        expect(s3Service.copyObject).toHaveBeenCalledWith(from, to);
      });

      it("keeps the entry, and the photo at its old key, when the copy fails", async () => {
        s3Service.copyObject.mockRejectedValue(new Error("s3 down"));

        await expect(service.drain({ userId })).resolves.toEqual({ done: 0, failed: 1, givenUp: 0 });

        expect(prisma.photo.updateMany).not.toHaveBeenCalled();
        expect(s3Service.deleteObjects).not.toHaveBeenCalled();
      });

      it("finishes a move an earlier drain left half done: the row already names the copy", async () => {
        prisma.photo.findUnique.mockResolvedValue({ s3Key: to } as never);

        await expect(service.drain({ userId })).resolves.toMatchObject({ done: 1 });

        expect(s3Service.copyObject).not.toHaveBeenCalled();
        expect(s3Service.deleteObjects).toHaveBeenCalledWith([
          from,
          `derived/${from}/thumb.webp`,
          `derived/${from}/large.jpg`,
        ]);
      });

      it("takes its copies back when the photo was deleted meanwhile", async () => {
        prisma.photo.findUnique.mockResolvedValue(null);

        await expect(service.drain({ userId })).resolves.toMatchObject({ done: 1 });

        expect(s3Service.deleteObjects).toHaveBeenCalledWith([
          to,
          `derived/${to}/thumb.webp`,
          `derived/${to}/large.jpg`,
        ]);
      });

      it("takes its copies back when the photo is deleted between the copy and the update", async () => {
        prisma.photo.updateMany.mockResolvedValue({ count: 0 });
        prisma.photo.findUnique.mockResolvedValueOnce({ s3Key: from } as never).mockResolvedValueOnce(null);

        await expect(service.drain({ userId })).resolves.toMatchObject({ done: 1 });

        expect(s3Service.deleteObjects).toHaveBeenCalledWith([
          to,
          `derived/${to}/thumb.webp`,
          `derived/${to}/large.jpg`,
        ]);
      });

      it("retries when S3 refuses to delete the old original", async () => {
        s3Service.deleteObjects.mockResolvedValue({ deleted: [], failed: [{ key: from, code: "InternalError" }] });

        await expect(service.drain({ userId })).resolves.toEqual({ done: 0, failed: 1, givenUp: 0 });
      });

      it("leaves the photo where it is if its new key is somehow taken", async () => {
        prisma.photo.updateMany.mockRejectedValue(
          Object.assign(new Error("Unique constraint failed"), { code: "P2002" }),
        );

        await expect(service.drain({ userId })).resolves.toMatchObject({ done: 1 });

        expect(s3Service.deleteObjects).not.toHaveBeenCalled();
        expect(logger.error).toHaveBeenCalledWith(
          expect.objectContaining({ event: "user.account.photo_rekey_conflict", photoId }),
          expect.any(String),
        );
      });
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
