import { Test, TestingModule } from "@nestjs/testing";
import { AccessLevel, AccountDeletionPhotoPolicy, PhotoStatus, PrismaClient } from "generated/prisma/client";
import { DeepMockProxy, mockDeep } from "jest-mock-extended";
import { PinoLogger } from "nestjs-pino";
import { PrismaService } from "src/prisma/prisma.service";
import { AccountDeletionPrepService } from "./account-deletion-prep.service";

describe("AccountDeletionPrepService", () => {
  let service: AccountDeletionPrepService;
  let prisma: DeepMockProxy<PrismaClient>;
  let logger: { setContext: jest.Mock; info: jest.Mock; warn: jest.Mock; error: jest.Mock };

  const userId = "11111111-1111-1111-1111-111111111111";
  const soloEventId = "66666666-6666-6666-6666-666666666666";
  const sharedEventId = "77777777-7777-7777-7777-777777777777";
  const coOrganizedEventId = "88888888-8888-8888-8888-888888888888";

  const emptySummary = {
    eventsDeleted: 0,
    eventsHandedOver: 0,
    photosKept: 0,
    photosDeleted: 0,
    uploadsDiscarded: 0,
    avatarQueued: false,
  };

  beforeEach(async () => {
    prisma = mockDeep<PrismaClient>();
    // Prep runs in one interactive transaction, against the same mock client.
    prisma.$transaction.mockImplementation(async (fn) => (fn as (tx: unknown) => Promise<unknown>)(prisma));
    prisma.eventAccess.findMany.mockResolvedValue([]);
    prisma.eventAccess.count.mockResolvedValue(0);
    prisma.photo.findMany.mockResolvedValue([]);
    prisma.photo.deleteMany.mockResolvedValue({ count: 0 });
    prisma.photo.updateMany.mockResolvedValue({ count: 0 });
    prisma.userDetails.findUnique.mockResolvedValue({ avatarS3Key: null } as never);
    logger = { setContext: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AccountDeletionPrepService,
        { provide: PrismaService, useValue: prisma },
        { provide: PinoLogger, useValue: logger },
      ],
    }).compile();

    service = module.get(AccountDeletionPrepService);
  });

  it("does nothing and reports empty counts for an account with no events or photos", async () => {
    const result = await service.prepareRelatedData(userId, AccountDeletionPhotoPolicy.KEEP);

    expect(result).toEqual({ summary: emptySummary, s3Keys: [] });
    expect(prisma.event.deleteMany).not.toHaveBeenCalled();
    expect(prisma.eventAccess.update).not.toHaveBeenCalled();
  });

  it("runs everything in a single transaction and logs an audit summary", async () => {
    await service.prepareRelatedData(userId, AccountDeletionPhotoPolicy.KEEP);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ event: "user.account.deletion_prepared", userId, photoPolicy: "KEEP", audit: true }),
      expect.any(String),
    );
  });

  describe("events the account organises", () => {
    beforeEach(() => {
      prisma.eventAccess.findMany.mockResolvedValue([
        { eventId: coOrganizedEventId },
        { eventId: sharedEventId },
        { eventId: soloEventId },
      ] as never);
      prisma.eventAccess.count.mockImplementation(((args: { where: { eventId?: string; accessLevel?: string } }) =>
        Promise.resolve(args.where.eventId === coOrganizedEventId ? 1 : 0)) as never);
      prisma.eventAccess.findFirst.mockImplementation(((args: { where: { eventId?: string } }) =>
        Promise.resolve(args.where.eventId === sharedEventId ? { id: "successor-access" } : null)) as never);
      prisma.eventAccess.update.mockResolvedValue({} as never);
      prisma.photo.findMany.mockImplementation(((args: { where: { eventId?: string } }) =>
        Promise.resolve(
          args.where.eventId === soloEventId ? [{ s3Key: "photos/solo/a" }, { s3Key: "photos/solo/b" }] : [],
        )) as never);
      prisma.event.deleteMany.mockResolvedValue({ count: 1 });
    });

    it("leaves an event that still has another organizer untouched", async () => {
      await service.prepareRelatedData(userId, AccountDeletionPhotoPolicy.KEEP);

      const successorSearches = prisma.eventAccess.findFirst.mock.calls.map(
        ([args]) => (args as { where: { eventId: string } }).where.eventId,
      );
      expect(successorSearches).not.toContain(coOrganizedEventId);
      expect(prisma.event.deleteMany).not.toHaveBeenCalledWith({ where: { id: coOrganizedEventId } });
    });

    it("promotes the longest-standing member when the account was the only organizer", async () => {
      const result = await service.prepareRelatedData(userId, AccountDeletionPhotoPolicy.KEEP);

      expect(prisma.eventAccess.findFirst).toHaveBeenCalledWith({
        where: { eventId: sharedEventId, userId: { not: userId }, user: { deletionStartedAt: null } },
        // Participants before viewers, then oldest membership: deterministic, not random.
        orderBy: [{ accessLevel: "asc" }, { createdAt: "asc" }],
        select: { id: true },
      });
      expect(prisma.eventAccess.update).toHaveBeenCalledWith({
        where: { id: "successor-access" },
        data: { accessLevel: AccessLevel.ORGANIZER },
      });
      expect(result.summary.eventsHandedOver).toBe(1);
    });

    it("deletes an event nobody else is in and collects its photo keys", async () => {
      const result = await service.prepareRelatedData(userId, AccountDeletionPhotoPolicy.KEEP);

      expect(prisma.event.deleteMany).toHaveBeenCalledWith({ where: { id: soloEventId } });
      expect(result.summary.eventsDeleted).toBe(1);
      expect(result.s3Keys).toEqual(expect.arrayContaining(["photos/solo/a", "photos/solo/b"]));
    });

    it("counts an event as deleted only when the row was actually still there", async () => {
      // A concurrent deletion of the last other member may have removed it first.
      prisma.event.deleteMany.mockResolvedValue({ count: 0 });

      const result = await service.prepareRelatedData(userId, AccountDeletionPhotoPolicy.KEEP);

      expect(result.summary.eventsDeleted).toBe(0);
    });

    it("ignores an organizer who is also deleting, and hands over instead of assuming cover", async () => {
      // Two organizers leaving at once is what used to leave an event with
      // nobody in charge: each counted the other as cover and skipped it.
      prisma.eventAccess.findMany.mockResolvedValue([{ eventId: sharedEventId }] as never);
      prisma.eventAccess.count.mockResolvedValue(0);

      await service.prepareRelatedData(userId, AccountDeletionPhotoPolicy.KEEP);

      expect(prisma.eventAccess.count).toHaveBeenCalledWith({
        where: {
          eventId: sharedEventId,
          accessLevel: AccessLevel.ORGANIZER,
          userId: { not: userId },
          user: { deletionStartedAt: null },
        },
      });
      expect(prisma.eventAccess.update).toHaveBeenCalledWith({
        where: { id: "successor-access" },
        data: { accessLevel: AccessLevel.ORGANIZER },
      });
    });
  });

  describe("photos", () => {
    const pending = [{ s3Key: "photos/u/e/pending-1" }, { s3Key: "photos/u/e/pending-2" }];
    const ready = [{ s3Key: "photos/u/e/ready-1" }];

    beforeEach(() => {
      prisma.photo.findMany.mockImplementation(((args: { where: { status?: PhotoStatus } }) =>
        Promise.resolve(args.where.status === PhotoStatus.PENDING ? pending : ready)) as never);
      prisma.photo.deleteMany.mockImplementation(((args: { where: { status?: PhotoStatus } }) =>
        Promise.resolve({
          count: args.where.status === PhotoStatus.PENDING ? pending.length : ready.length,
        })) as never);
      prisma.photo.updateMany.mockResolvedValue({ count: ready.length });
    });

    it("always discards uploads in flight and collects their keys", async () => {
      const result = await service.prepareRelatedData(userId, AccountDeletionPhotoPolicy.KEEP);

      expect(prisma.photo.deleteMany).toHaveBeenCalledWith({
        where: { addedById: userId, status: PhotoStatus.PENDING },
      });
      expect(result.summary.uploadsDiscarded).toBe(2);
      expect(result.s3Keys).toEqual(expect.arrayContaining(pending.map((photo) => photo.s3Key)));
    });

    it("keeps uploaded photos in the event with no uploader by default", async () => {
      const result = await service.prepareRelatedData(userId, AccountDeletionPhotoPolicy.KEEP);

      expect(prisma.photo.updateMany).toHaveBeenCalledWith({ where: { addedById: userId }, data: { addedById: null } });
      expect(prisma.photo.deleteMany).not.toHaveBeenCalledWith({ where: { addedById: userId } });
      expect(result.summary).toMatchObject({ photosKept: 1, photosDeleted: 0 });
      // A kept photo's object must not be purged.
      expect(result.s3Keys).not.toContain("photos/u/e/ready-1");
    });

    it("removes uploaded photos everywhere when asked to", async () => {
      const result = await service.prepareRelatedData(userId, AccountDeletionPhotoPolicy.DELETE);

      expect(prisma.photo.deleteMany).toHaveBeenCalledWith({ where: { addedById: userId } });
      expect(prisma.photo.updateMany).not.toHaveBeenCalled();
      expect(result.summary).toMatchObject({ photosKept: 0, photosDeleted: 1, uploadsDiscarded: 2 });
      expect(result.s3Keys).toEqual(expect.arrayContaining(["photos/u/e/ready-1", "photos/u/e/pending-1"]));
    });
  });

  describe("avatar", () => {
    const avatarS3Key = `avatars/${userId}/99999999-9999-9999-9999-999999999999`;

    it("queues the avatar object for the purge and leaves the row to the cascade", async () => {
      prisma.userDetails.findUnique.mockResolvedValue({ avatarS3Key } as never);

      const result = await service.prepareRelatedData(userId, AccountDeletionPhotoPolicy.KEEP);

      expect(prisma.userDetails.findUnique).toHaveBeenCalledWith({
        where: { userId },
        select: { avatarS3Key: true },
      });
      expect(result).toEqual({ summary: { ...emptySummary, avatarQueued: true }, s3Keys: [avatarS3Key] });
      expect(prisma.userDetails.update).not.toHaveBeenCalled();
      expect(prisma.userDetails.updateMany).not.toHaveBeenCalled();
    });

    it("queues it whatever the photo policy: an avatar is never shared content", async () => {
      prisma.userDetails.findUnique.mockResolvedValue({ avatarS3Key } as never);

      const result = await service.prepareRelatedData(userId, AccountDeletionPhotoPolicy.DELETE);

      expect(result.s3Keys).toEqual([avatarS3Key]);
    });

    it("finds the same key again on a resumed saga", async () => {
      prisma.userDetails.findUnique.mockResolvedValue({ avatarS3Key } as never);

      const first = await service.prepareRelatedData(userId, AccountDeletionPhotoPolicy.KEEP);
      const second = await service.prepareRelatedData(userId, AccountDeletionPhotoPolicy.KEEP);

      expect(second.s3Keys).toEqual(first.s3Keys);
    });

    it("queues nothing for an account that never onboarded", async () => {
      prisma.userDetails.findUnique.mockResolvedValue(null);

      const result = await service.prepareRelatedData(userId, AccountDeletionPhotoPolicy.KEEP);

      expect(result).toEqual({ summary: emptySummary, s3Keys: [] });
    });
  });

  it("is idempotent: a second pass over an already-prepared account changes nothing", async () => {
    // Events handed over now have another organizer, and the photos are settled.
    prisma.eventAccess.findMany.mockResolvedValue([{ eventId: sharedEventId }] as never);
    prisma.eventAccess.count.mockResolvedValue(1);

    const result = await service.prepareRelatedData(userId, AccountDeletionPhotoPolicy.KEEP);

    expect(prisma.eventAccess.update).not.toHaveBeenCalled();
    expect(prisma.event.deleteMany).not.toHaveBeenCalled();
    expect(result).toEqual({ summary: emptySummary, s3Keys: [] });
  });
});
