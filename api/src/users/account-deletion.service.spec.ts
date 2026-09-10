import { Test, TestingModule } from "@nestjs/testing";
import { AccessLevel, PhotoStatus, Prisma, PrismaClient } from "generated/prisma/client";
import { DeepMockProxy, mockDeep } from "jest-mock-extended";
import { PinoLogger } from "nestjs-pino";
import { PhotoPurgeService } from "src/photos/photo-purge.service";
import { PrismaService } from "src/prisma/prisma.service";
import { AccountDeletionService } from "./account-deletion.service";
import { hashProviderSub } from "./deleted-account";
import { ACCOUNT_DELETION_PHOTO_POLICIES } from "./users.constants";

describe("AccountDeletionService", () => {
  let service: AccountDeletionService;
  let prisma: DeepMockProxy<PrismaClient>;
  let photoPurgeService: { purgeObjects: jest.Mock };
  let logger: { setContext: jest.Mock; info: jest.Mock; warn: jest.Mock; error: jest.Mock; debug: jest.Mock };

  const userId = "11111111-1111-1111-1111-111111111111";
  const providerSub = "auth0|deleting";
  const soloEventId = "66666666-6666-6666-6666-666666666666";
  const sharedEventId = "77777777-7777-7777-7777-777777777777";
  const coOrganizedEventId = "88888888-8888-8888-8888-888888888888";

  const user = { id: userId, providerSub } as never;
  const noRecordError = () =>
    new Prisma.PrismaClientKnownRequestError("Record to delete does not exist.", {
      code: "P2025",
      clientVersion: "7.8.0",
    });

  beforeEach(async () => {
    prisma = mockDeep<PrismaClient>();
    // Interactive transactions run their callback against the same mock client.
    prisma.$transaction.mockImplementation(async (fn) => (fn as (tx: unknown) => Promise<unknown>)(prisma));
    prisma.user.findUnique.mockResolvedValue(user);
    prisma.eventAccess.findMany.mockResolvedValue([]);
    prisma.eventAccess.count.mockResolvedValue(0);
    prisma.photo.findMany.mockResolvedValue([]);
    prisma.photo.deleteMany.mockResolvedValue({ count: 0 });
    prisma.photo.updateMany.mockResolvedValue({ count: 0 });
    prisma.deletedAccount.upsert.mockResolvedValue({} as never);
    prisma.user.delete.mockResolvedValue(user);

    photoPurgeService = { purgeObjects: jest.fn().mockResolvedValue({ requested: 0, deleted: 0, failed: 0 }) };
    logger = { setContext: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AccountDeletionService,
        { provide: PrismaService, useValue: prisma },
        { provide: PhotoPurgeService, useValue: photoPurgeService },
        { provide: PinoLogger, useValue: logger },
      ],
    }).compile();

    service = module.get(AccountDeletionService);
  });

  const emptySummary = {
    eventsDeleted: 0,
    eventsHandedOver: 0,
    membershipsRemoved: 0,
    photosKept: 0,
    photosDeleted: 0,
    uploadsDiscarded: 0,
  };

  it("returns null and touches nothing when the account is already gone", async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(service.deleteAccount(userId, ACCOUNT_DELETION_PHOTO_POLICIES.KEEP)).resolves.toBeNull();

    expect(prisma.user.delete).not.toHaveBeenCalled();
    expect(prisma.deletedAccount.upsert).not.toHaveBeenCalled();
    expect(photoPurgeService.purgeObjects).not.toHaveBeenCalled();
  });

  it("writes the hashed tombstone, then deletes the row, inside one transaction", async () => {
    await service.deleteAccount(userId, ACCOUNT_DELETION_PHOTO_POLICIES.KEEP);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    const providerSubHash = hashProviderSub(providerSub);
    expect(prisma.deletedAccount.upsert).toHaveBeenCalledWith({
      where: { providerSubHash },
      create: { providerSubHash, userId },
      update: { userId, deletedAt: expect.any(Date) as Date },
    });
    expect(prisma.deletedAccount.upsert.mock.invocationCallOrder[0]).toBeLessThan(
      prisma.user.delete.mock.invocationCallOrder[0],
    );
    expect(prisma.user.delete).toHaveBeenCalledWith({ where: { id: userId } });
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ event: "user.account.deleted", userId, photoPolicy: "keep", audit: true }),
      expect.any(String),
    );
  });

  it("never stores the raw subject in the tombstone", async () => {
    await service.deleteAccount(userId, ACCOUNT_DELETION_PHOTO_POLICIES.KEEP);

    const [args] = prisma.deletedAccount.upsert.mock.calls[0];
    expect(JSON.stringify(args)).not.toContain(providerSub);
  });

  describe("events the account organises", () => {
    beforeEach(() => {
      prisma.eventAccess.findMany.mockResolvedValue([
        { eventId: coOrganizedEventId },
        { eventId: sharedEventId },
        { eventId: soloEventId },
      ] as never);
      prisma.eventAccess.count.mockImplementation(((args: { where: { eventId?: string; accessLevel?: string } }) => {
        // Only the co-organised event has another organizer.
        if (args.where.accessLevel === AccessLevel.ORGANIZER) {
          return Promise.resolve(args.where.eventId === coOrganizedEventId ? 1 : 0);
        }
        // Memberships left on the account once the solo event is gone.
        return Promise.resolve(2);
      }) as never);
      prisma.eventAccess.findFirst.mockImplementation(((args: { where: { eventId?: string } }) =>
        Promise.resolve(args.where.eventId === sharedEventId ? { id: "successor-access" } : null)) as never);
      prisma.eventAccess.update.mockResolvedValue({} as never);
      prisma.photo.findMany.mockImplementation(((args: { where: { eventId?: string; addedById?: string } }) =>
        Promise.resolve(
          args.where.eventId === soloEventId ? [{ s3Key: "photos/solo/a" }, { s3Key: "photos/solo/b" }] : [],
        )) as never);
      prisma.event.delete.mockResolvedValue({} as never);
    });

    it("leaves events that have another organizer alone", async () => {
      await service.deleteAccount(userId, ACCOUNT_DELETION_PHOTO_POLICIES.KEEP);

      const successorSearches = prisma.eventAccess.findFirst.mock.calls.map(
        ([args]) => (args as { where: { eventId: string } }).where.eventId,
      );
      expect(successorSearches).not.toContain(coOrganizedEventId);
      expect(prisma.event.delete).not.toHaveBeenCalledWith({ where: { id: coOrganizedEventId } });
    });

    it("hands an event with other members to the longest-standing participant", async () => {
      const summary = await service.deleteAccount(userId, ACCOUNT_DELETION_PHOTO_POLICIES.KEEP);

      expect(prisma.eventAccess.findFirst).toHaveBeenCalledWith({
        where: { eventId: sharedEventId, userId: { not: userId } },
        orderBy: [{ accessLevel: "asc" }, { createdAt: "asc" }],
        select: { id: true },
      });
      expect(prisma.eventAccess.update).toHaveBeenCalledWith({
        where: { id: "successor-access" },
        data: { accessLevel: AccessLevel.ORGANIZER },
      });
      expect(prisma.event.delete).not.toHaveBeenCalledWith({ where: { id: sharedEventId } });
      expect(summary).toMatchObject({ eventsHandedOver: 1 });
    });

    it("deletes an event nobody else is in, and purges all of its photos after the commit", async () => {
      const summary = await service.deleteAccount(userId, ACCOUNT_DELETION_PHOTO_POLICIES.KEEP);

      expect(prisma.event.delete).toHaveBeenCalledWith({ where: { id: soloEventId } });
      expect(prisma.event.delete.mock.invocationCallOrder[0]).toBeLessThan(
        prisma.user.delete.mock.invocationCallOrder[0],
      );
      expect(photoPurgeService.purgeObjects).toHaveBeenCalledWith(["photos/solo/a", "photos/solo/b"], {
        event: "user.account.photos_purged",
        callerId: userId,
      });
      expect(prisma.user.delete.mock.invocationCallOrder[0]).toBeLessThan(
        photoPurgeService.purgeObjects.mock.invocationCallOrder[0],
      );
      expect(summary).toEqual({ ...emptySummary, eventsDeleted: 1, eventsHandedOver: 1, membershipsRemoved: 2 });
    });
  });

  describe("photos in events that survive", () => {
    const pending = [{ s3Key: "photos/u/e/pending-1" }, { s3Key: "photos/u/e/pending-2" }];
    const ready = [{ s3Key: "photos/u/e/ready-1" }];

    beforeEach(() => {
      prisma.photo.findMany.mockImplementation(((args: { where: { status?: string } }) =>
        Promise.resolve(args.where.status === PhotoStatus.PENDING ? pending : ready)) as never);
      prisma.photo.deleteMany.mockImplementation(((args: { where: { status?: string } }) =>
        Promise.resolve({
          count: args.where.status === PhotoStatus.PENDING ? pending.length : ready.length,
        })) as never);
      prisma.photo.updateMany.mockResolvedValue({ count: ready.length });
    });

    it("always discards uploads in flight and purges their keys", async () => {
      const summary = await service.deleteAccount(userId, ACCOUNT_DELETION_PHOTO_POLICIES.KEEP);

      expect(prisma.photo.deleteMany).toHaveBeenCalledWith({
        where: { addedById: userId, status: PhotoStatus.PENDING },
      });
      expect(photoPurgeService.purgeObjects).toHaveBeenCalledWith(
        pending.map((photo) => photo.s3Key),
        expect.anything(),
      );
      expect(summary).toMatchObject({ uploadsDiscarded: 2 });
    });

    it("keeps READY photos without an uploader by default", async () => {
      const summary = await service.deleteAccount(userId, ACCOUNT_DELETION_PHOTO_POLICIES.KEEP);

      expect(prisma.photo.updateMany).toHaveBeenCalledWith({ where: { addedById: userId }, data: { addedById: null } });
      expect(prisma.photo.deleteMany).not.toHaveBeenCalledWith({ where: { addedById: userId } });
      expect(summary).toMatchObject({ photosKept: 1, photosDeleted: 0 });
      const [purgedKeys] = photoPurgeService.purgeObjects.mock.calls[0] as [string[]];
      expect(purgedKeys).not.toContain("photos/u/e/ready-1");
    });

    it("deletes READY photos everywhere when asked to", async () => {
      const summary = await service.deleteAccount(userId, ACCOUNT_DELETION_PHOTO_POLICIES.DELETE);

      expect(prisma.photo.deleteMany).toHaveBeenCalledWith({ where: { addedById: userId } });
      expect(prisma.photo.updateMany).not.toHaveBeenCalled();
      expect(summary).toMatchObject({ photosKept: 0, photosDeleted: 1, uploadsDiscarded: 2 });
      const [purgedKeys] = photoPurgeService.purgeObjects.mock.calls[0] as [string[]];
      expect(purgedKeys).toEqual(expect.arrayContaining(["photos/u/e/ready-1", "photos/u/e/pending-1"]));
    });

    it("returns 204-worthy success even when the S3 purge fails", async () => {
      photoPurgeService.purgeObjects.mockResolvedValue({ requested: 3, deleted: 0, failed: 3 });

      await expect(service.deleteAccount(userId, ACCOUNT_DELETION_PHOTO_POLICIES.DELETE)).resolves.toMatchObject({
        photosDeleted: 1,
      });
    });
  });

  describe("races", () => {
    it("retries once when a row vanished mid-transaction, and reports success if the account is gone", async () => {
      prisma.user.delete.mockRejectedValueOnce(noRecordError());
      prisma.user.findUnique.mockResolvedValueOnce(user).mockResolvedValueOnce(null);

      await expect(service.deleteAccount(userId, ACCOUNT_DELETION_PHOTO_POLICIES.KEEP)).resolves.toBeNull();

      expect(prisma.$transaction).toHaveBeenCalledTimes(2);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ event: "user.account.deletion_retried", userId, attempt: 1 }),
        expect.any(String),
      );
      expect(photoPurgeService.purgeObjects).not.toHaveBeenCalled();
    });

    it("finishes the deletion on the retry when the account is still there", async () => {
      prisma.eventAccess.update.mockRejectedValueOnce(noRecordError()).mockResolvedValue({} as never);
      prisma.eventAccess.findMany.mockResolvedValue([{ eventId: sharedEventId }] as never);
      prisma.eventAccess.findFirst.mockResolvedValue({ id: "successor-access" } as never);

      await expect(service.deleteAccount(userId, ACCOUNT_DELETION_PHOTO_POLICIES.KEEP)).resolves.toMatchObject({
        eventsHandedOver: 1,
      });

      expect(prisma.$transaction).toHaveBeenCalledTimes(2);
      expect(prisma.user.delete).toHaveBeenCalledTimes(1);
    });

    it("gives up after the second lost race", async () => {
      prisma.user.delete.mockRejectedValue(noRecordError());

      await expect(service.deleteAccount(userId, ACCOUNT_DELETION_PHOTO_POLICIES.KEEP)).rejects.toBeInstanceOf(
        Prisma.PrismaClientKnownRequestError,
      );

      expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    });

    it("rethrows other database errors without retrying", async () => {
      prisma.user.delete.mockRejectedValue(new Error("db down"));

      await expect(service.deleteAccount(userId, ACCOUNT_DELETION_PHOTO_POLICIES.KEEP)).rejects.toThrow("db down");

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });
  });
});
