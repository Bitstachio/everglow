import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
import { AccountDeletionPhotoPolicy, PrismaClient } from "generated/prisma/client";
import { DeepMockProxy, mockDeep } from "jest-mock-extended";
import { PinoLogger } from "nestjs-pino";
import { PrismaService } from "src/prisma/prisma.service";
import { AccountDeletionReconcilerService } from "./account-deletion-reconciler.service";
import { UsersService } from "./users.service";

describe("AccountDeletionReconcilerService", () => {
  let service: AccountDeletionReconcilerService;
  let prisma: DeepMockProxy<PrismaClient>;
  let usersService: { completeAccountDeletion: jest.Mock };
  let logger: { setContext: jest.Mock; info: jest.Mock; warn: jest.Mock; error: jest.Mock };

  const now = new Date("2026-06-10T12:00:00.000Z");
  const MAX_ATTEMPTS = 5;
  const REPORT_RETENTION_DAYS = 365;
  const pendingUser = {
    id: "11111111-1111-1111-1111-111111111111",
    providerSub: "auth0|abc123",
    deletionStartedAt: new Date("2026-06-10T10:00:00.000Z"),
    auth0DeletedAt: new Date("2026-06-10T10:01:00.000Z"),
    deletionPhotoPolicy: AccountDeletionPhotoPolicy.KEEP,
    deletionAttempts: 0,
  };

  beforeEach(async () => {
    jest.useFakeTimers();
    jest.setSystemTime(now);

    prisma = mockDeep<PrismaClient>();
    usersService = { completeAccountDeletion: jest.fn().mockResolvedValue(undefined) };
    // No tombstones to purge unless a case says otherwise.
    prisma.deletedProviderSub.deleteMany.mockResolvedValue({ count: 0 });
    prisma.deletedProviderSub.findMany.mockResolvedValue([]);
    prisma.report.findMany.mockResolvedValue([]);
    logger = { setContext: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AccountDeletionReconcilerService,
        { provide: PrismaService, useValue: prisma },
        { provide: UsersService, useValue: usersService },
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: jest.fn((key: string) => {
              if (key === "users.accountDeletionReconcilerBatchSize") return 50;
              if (key === "users.accountDeletionReconcilerStuckAfterHours") return 1;
              if (key === "users.accountDeletionMaxAttempts") return MAX_ATTEMPTS;
              if (key === "moderation.reportRetentionDays") return REPORT_RETENTION_DAYS;
              throw new Error(`Unexpected key: ${key}`);
            }),
          },
        },
        { provide: PinoLogger, useValue: logger },
      ],
    }).compile();

    service = module.get(AccountDeletionReconcilerService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("completes pending deletions and reports counts", async () => {
    prisma.user.findMany.mockResolvedValue([pendingUser] as never);

    const result = await service.reconcilePendingDeletions();

    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: { deletionStartedAt: { not: null }, deletionAttempts: { lt: MAX_ATTEMPTS } },
      orderBy: { deletionStartedAt: "asc" },
      take: 50,
      select: {
        id: true,
        providerSub: true,
        deletionStartedAt: true,
        auth0DeletedAt: true,
        deletionPhotoPolicy: true,
        deletionAttempts: true,
      },
    });
    expect(usersService.completeAccountDeletion).toHaveBeenCalledWith(pendingUser);
    expect(result).toEqual({ scanned: 1, deleted: 1, failed: 0, stuck: 1, abandoned: 0, tombstonesPurged: 0 });
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ event: "user.account.deletion_stuck", userId: pendingUser.id }),
      expect.any(String),
    );
  });

  it("counts failures without aborting the batch", async () => {
    const other = { ...pendingUser, id: "22222222-2222-2222-2222-222222222222" };
    prisma.user.findMany.mockResolvedValue([pendingUser, other] as never);
    usersService.completeAccountDeletion.mockRejectedValueOnce(new Error("fk")).mockResolvedValueOnce(undefined);

    const result = await service.reconcilePendingDeletions();

    expect(result).toEqual({ scanned: 2, deleted: 1, failed: 1, stuck: 2, abandoned: 0, tombstonesPurged: 0 });
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ event: "user.account.deletion_reconcile.failed", userId: pendingUser.id }),
      expect.any(String),
    );
  });

  it("counts a failed pass against the row's attempt budget", async () => {
    prisma.user.findMany.mockResolvedValue([pendingUser] as never);
    usersService.completeAccountDeletion.mockRejectedValue(new Error("fk"));

    await service.reconcilePendingDeletions();

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: pendingUser.id },
      data: { deletionAttempts: 1 },
    });
  });

  it("stops retrying and reports once when the budget runs out", async () => {
    prisma.user.findMany.mockResolvedValue([{ ...pendingUser, deletionAttempts: MAX_ATTEMPTS - 1 }] as never);
    usersService.completeAccountDeletion.mockRejectedValue(new Error("fk"));

    const result = await service.reconcilePendingDeletions();

    expect(result).toEqual({ scanned: 1, deleted: 0, failed: 1, stuck: 1, abandoned: 1, tombstonesPurged: 0 });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: pendingUser.id },
      data: { deletionAttempts: MAX_ATTEMPTS },
    });
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "user.account.deletion_abandoned",
        userId: pendingUser.id,
        attempts: MAX_ATTEMPTS,
      }),
      expect.any(String),
    );
  });

  it("does not report abandonment while attempts remain", async () => {
    prisma.user.findMany.mockResolvedValue([pendingUser] as never);
    usersService.completeAccountDeletion.mockRejectedValue(new Error("fk"));

    await service.reconcilePendingDeletions();

    expect(logger.error).not.toHaveBeenCalledWith(
      expect.objectContaining({ event: "user.account.deletion_abandoned" }),
      expect.any(String),
    );
  });

  it("keeps going when the attempt counter itself cannot be written", async () => {
    prisma.user.findMany.mockResolvedValue([pendingUser] as never);
    usersService.completeAccountDeletion.mockRejectedValue(new Error("fk"));
    prisma.user.update.mockRejectedValue(new Error("db down"));

    await expect(service.reconcilePendingDeletions()).resolves.toMatchObject({ failed: 1 });
  });

  describe("purgeExpiredTombstones", () => {
    const DAY_MS = 24 * 60 * 60 * 1000;
    const daysAgo = (n: number) => new Date(now.getTime() - n * DAY_MS);
    const sanctioned = (hash: string, formerUserId: string, deletedAt: Date) => ({
      providerSubHash: hash,
      formerUserId,
      deletedAt,
    });

    it("deletes tombstones that carry nothing once they are past the base window, in one statement", async () => {
      prisma.deletedProviderSub.deleteMany.mockResolvedValueOnce({ count: 3 });

      await expect(service.purgeExpiredTombstones(now)).resolves.toEqual({ purged: 3, sanctionedKept: 0 });

      expect(prisma.deletedProviderSub.deleteMany).toHaveBeenCalledWith({
        where: { deletedAt: { lt: daysAgo(30) }, suspendedAt: null, bans: { none: {} } },
      });
    });

    it("judges sanctioned tombstones by the reports about the account, found through their evidence", async () => {
      prisma.deletedProviderSub.findMany.mockResolvedValueOnce([
        sanctioned("a", "user-a", daysAgo(400)), // no reports, past a year
        sanctioned("b", "user-b", daysAgo(400)), // a report still open
        sanctioned("c", "user-c", daysAgo(100)), // no reports, inside the year
        sanctioned("d", "user-d", daysAgo(400)), // its report closed 200 days ago
      ] as never);
      prisma.report.findMany.mockResolvedValueOnce([
        { resolvedAt: null, holdUntil: null, evidence: { subjectUserId: "user-b" } },
        { resolvedAt: daysAgo(200), holdUntil: null, evidence: { subjectUserId: "user-d" } },
      ] as never);
      prisma.deletedProviderSub.deleteMany.mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({ count: 1 });

      const result = await service.purgeExpiredTombstones(now);

      expect(prisma.deletedProviderSub.findMany).toHaveBeenCalledWith({
        where: { deletedAt: { lt: daysAgo(30) }, OR: [{ suspendedAt: { not: null } }, { bans: { some: {} } }] },
        orderBy: { providerSubHash: "asc" },
        take: 50,
        select: { providerSubHash: true, formerUserId: true, deletedAt: true },
      });
      expect(prisma.report.findMany).toHaveBeenCalledWith({
        where: { evidence: { subjectUserId: { in: ["user-a", "user-b", "user-c", "user-d"] } } },
        select: { resolvedAt: true, holdUntil: true, evidence: { select: { subjectUserId: true } } },
      });
      // Only "a" has run out; matched on deletedAt so a newer deletion of the same identity survives.
      expect(prisma.deletedProviderSub.deleteMany).toHaveBeenLastCalledWith({
        where: { OR: [{ providerSubHash: "a", deletedAt: daysAgo(400) }] },
      });
      expect(result).toEqual({ purged: 1, sanctionedKept: 3 });
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({ event: "user.tombstone.purged", purged: 1, sanctionedKept: 3 }),
        expect.any(String),
      );
    });

    it("pages through every sanctioned tombstone, so held ones never hide the rest", async () => {
      const fullPage = Array.from({ length: 50 }, (_, i) =>
        sanctioned(`hash-${String(i).padStart(2, "0")}`, `user-${i}`, daysAgo(100)),
      );
      prisma.deletedProviderSub.findMany
        .mockResolvedValueOnce(fullPage as never)
        .mockResolvedValueOnce([sanctioned("hash-zz", "user-z", daysAgo(400))] as never);
      prisma.deletedProviderSub.deleteMany.mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({ count: 1 });

      await expect(service.purgeExpiredTombstones(now)).resolves.toEqual({ purged: 1, sanctionedKept: 50 });

      expect(prisma.deletedProviderSub.findMany).toHaveBeenCalledTimes(2);
      expect(prisma.deletedProviderSub.findMany).toHaveBeenLastCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ providerSubHash: { gt: "hash-49" } }) as unknown,
        }),
      );
    });

    it("runs at the end of every reconcile pass and reports what it purged", async () => {
      prisma.user.findMany.mockResolvedValue([]);
      prisma.deletedProviderSub.deleteMany.mockResolvedValueOnce({ count: 2 });

      await expect(service.reconcilePendingDeletions()).resolves.toMatchObject({ tombstonesPurged: 2 });
    });
  });
});
