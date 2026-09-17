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
    expect(result).toEqual({ scanned: 1, deleted: 1, failed: 0, stuck: 1, abandoned: 0 });
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

    expect(result).toEqual({ scanned: 2, deleted: 1, failed: 1, stuck: 2, abandoned: 0 });
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

    expect(result).toEqual({ scanned: 1, deleted: 0, failed: 1, stuck: 1, abandoned: 1 });
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
});
