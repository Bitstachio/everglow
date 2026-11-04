import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
import { AccountDeletionPhotoPolicy, PrismaClient } from "generated/prisma/client";
import { DeepMockProxy, mockDeep } from "jest-mock-extended";
import { PinoLogger } from "nestjs-pino";
import { ApiException } from "src/common/errors/api.exception";
import { PrismaService } from "src/prisma/prisma.service";
import { AccountDeletionPreflightService } from "./account-deletion-preflight.service";
import { AccountDeletionReconcilerService } from "./account-deletion-reconciler.service";
import { UsersService } from "./users.service";

describe("AccountDeletionReconcilerService", () => {
  let service: AccountDeletionReconcilerService;
  let prisma: DeepMockProxy<PrismaClient>;
  let usersService: { completeAccountDeletion: jest.Mock };
  let preflight: { assertCanFinish: jest.Mock };
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
    deletionClaimedUntil: new Date("2026-06-10T12:05:00.000Z"),
  };

  beforeEach(async () => {
    jest.useFakeTimers();
    jest.setSystemTime(now);

    prisma = mockDeep<PrismaClient>();
    usersService = { completeAccountDeletion: jest.fn().mockResolvedValue("deleted") };
    preflight = { assertCanFinish: jest.fn().mockResolvedValue(undefined) };
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
        { provide: AccountDeletionPreflightService, useValue: preflight },
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

  /** The SQL text of a raw call, placeholders joined. */
  const sqlOf = (call: unknown[]) => (call[0] as TemplateStringsArray).join("?");
  const claimCalls = () => prisma.$queryRaw.mock.calls.filter((call) => sqlOf(call).includes("SKIP LOCKED"));
  const releaseCalls = () => prisma.$queryRaw.mock.calls.filter((call) => sqlOf(call).includes("= NULL"));

  /** Each claim hands out the next row, as `FOR UPDATE SKIP LOCKED` would, then nothing. */
  const pendingRows = (...rows: (typeof pendingUser)[]) => {
    const queue = [...rows];
    prisma.$queryRaw.mockImplementation(((strings: TemplateStringsArray) => {
      if (strings.join("?").includes("SKIP LOCKED")) {
        const next = queue.shift();
        return Promise.resolve(next ? [next] : []);
      }
      return Promise.resolve([]);
    }) as never);
  };

  const result = (overrides: Partial<Awaited<ReturnType<typeof service.reconcilePendingDeletions>>> = {}) => ({
    scanned: 0,
    deleted: 0,
    failed: 0,
    stuck: 0,
    abandoned: 0,
    unavailable: 0,
    tombstonesPurged: 0,
    ...overrides,
  });

  it("claims pending deletions one at a time and finishes them", async () => {
    pendingRows(pendingUser);

    await expect(service.reconcilePendingDeletions()).resolves.toEqual(result({ scanned: 1, deleted: 1 }));

    expect(preflight.assertCanFinish).toHaveBeenCalledWith(pendingUser);
    expect(usersService.completeAccountDeletion).toHaveBeenCalledWith(pendingUser);
    // A deletion this run finishes is not stuck, however old it is.
    expect(logger.warn).not.toHaveBeenCalledWith(
      expect.objectContaining({ event: "user.account.deletion_stuck" }),
      expect.any(String),
    );
  });

  it("only claims deletions older than ten minutes, under the attempt budget, that nobody holds", async () => {
    pendingRows();

    await service.reconcilePendingDeletions();

    const [call] = claimCalls();
    const sql = sqlOf(call);
    expect(sql).toContain('"deletionStartedAt" < ');
    expect(sql).toContain('"deletionAttempts" < ');
    expect(sql).toContain('"deletionClaimedUntil" IS NULL OR "deletionClaimedUntil" < ');
    expect(sql).toContain("FOR UPDATE SKIP LOCKED");
    const values = JSON.stringify(call.slice(1));
    expect(values).toContain(new Date(now.getTime() - 10 * 60 * 1000).toISOString());
    expect(call).toContain(MAX_ATTEMPTS);
  });

  it("does not claim the same row twice in one run after it failed", async () => {
    const other = { ...pendingUser, id: "22222222-2222-2222-2222-222222222222" };
    pendingRows(pendingUser, other);
    usersService.completeAccountDeletion.mockRejectedValueOnce(new Error("fk")).mockResolvedValueOnce("deleted");

    await expect(service.reconcilePendingDeletions()).resolves.toEqual(
      result({ scanned: 2, deleted: 1, failed: 1, stuck: 1 }),
    );

    // Each claim skips the rows already tried.
    expect(claimCalls()[1]).toContainEqual([pendingUser.id]);
    expect(claimCalls()[2]).toContainEqual([pendingUser.id, other.id]);
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ event: "user.account.deletion_reconcile.failed", userId: pendingUser.id }),
      expect.any(String),
    );
  });

  it("counts a row another pass deleted first as a success", async () => {
    pendingRows(pendingUser);
    usersService.completeAccountDeletion.mockResolvedValue("vanished");

    await expect(service.reconcilePendingDeletions()).resolves.toEqual(result({ scanned: 1, deleted: 1 }));
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("logs deletion_stuck only after a failed attempt on an old deletion", async () => {
    const young = {
      ...pendingUser,
      id: "33333333-3333-3333-3333-333333333333",
      deletionStartedAt: new Date(now.getTime() - 20 * 60 * 1000),
    };
    pendingRows(pendingUser, young);
    usersService.completeAccountDeletion.mockRejectedValue(new Error("auth0 down"));

    await expect(service.reconcilePendingDeletions()).resolves.toMatchObject({ failed: 2, stuck: 1 });

    const stuck = logger.warn.mock.calls.filter(
      ([fields]) => (fields as { event?: string }).event === "user.account.deletion_stuck",
    );
    expect(stuck).toEqual([[expect.objectContaining({ userId: pendingUser.id, attempts: 1 }), expect.any(String)]]);
    expect(logger.error.mock.invocationCallOrder[0]).toBeLessThan(logger.warn.mock.invocationCallOrder[0]);
  });

  it("skips a row Auth0 or Apple cannot serve right now without spending an attempt", async () => {
    pendingRows(pendingUser);
    preflight.assertCanFinish.mockRejectedValue(new ApiException("ACCOUNT_DELETION_UNAVAILABLE"));

    await expect(service.reconcilePendingDeletions()).resolves.toEqual(result({ scanned: 1, unavailable: 1 }));

    expect(usersService.completeAccountDeletion).not.toHaveBeenCalled();
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(releaseCalls()).toHaveLength(1);
  });

  it("stops at the batch size", async () => {
    pendingRows(
      ...Array.from({ length: 60 }, (_, i) => ({
        ...pendingUser,
        id: `00000000-0000-0000-0000-${String(i).padStart(12, "0")}`,
      })),
    );

    await expect(service.reconcilePendingDeletions()).resolves.toMatchObject({ scanned: 50, deleted: 50 });
  });

  it("counts a failed pass against the row's attempt budget", async () => {
    pendingRows(pendingUser);
    usersService.completeAccountDeletion.mockRejectedValue(new Error("fk"));

    await service.reconcilePendingDeletions();

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: pendingUser.id },
      data: { deletionAttempts: 1 },
    });
  });

  it("stops retrying and reports once when the budget runs out", async () => {
    pendingRows({ ...pendingUser, deletionAttempts: MAX_ATTEMPTS - 1 });
    usersService.completeAccountDeletion.mockRejectedValue(new Error("fk"));

    await expect(service.reconcilePendingDeletions()).resolves.toEqual(
      result({ scanned: 1, failed: 1, stuck: 1, abandoned: 1 }),
    );
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
    pendingRows(pendingUser);
    usersService.completeAccountDeletion.mockRejectedValue(new Error("fk"));

    await service.reconcilePendingDeletions();

    expect(logger.error).not.toHaveBeenCalledWith(
      expect.objectContaining({ event: "user.account.deletion_abandoned" }),
      expect.any(String),
    );
  });

  it("keeps going when the attempt counter itself cannot be written", async () => {
    pendingRows(pendingUser);
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
      pendingRows();
      prisma.deletedProviderSub.deleteMany.mockResolvedValueOnce({ count: 2 });

      await expect(service.reconcilePendingDeletions()).resolves.toMatchObject({ tombstonesPurged: 2 });
    });
  });
});
