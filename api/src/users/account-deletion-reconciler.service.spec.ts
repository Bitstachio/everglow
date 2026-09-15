import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
import { PrismaClient } from "generated/prisma/client";
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
  const pendingUser = {
    id: "11111111-1111-1111-1111-111111111111",
    providerSub: "auth0|abc123",
    deletionStartedAt: new Date("2026-06-10T10:00:00.000Z"),
    auth0DeletedAt: new Date("2026-06-10T10:01:00.000Z"),
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
      where: { deletionStartedAt: { not: null } },
      orderBy: { deletionStartedAt: "asc" },
      take: 50,
      select: {
        id: true,
        providerSub: true,
        deletionStartedAt: true,
        auth0DeletedAt: true,
      },
    });
    expect(usersService.completeAccountDeletion).toHaveBeenCalledWith(pendingUser);
    expect(result).toEqual({ scanned: 1, deleted: 1, failed: 0, stuck: 1 });
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

    expect(result).toEqual({ scanned: 2, deleted: 1, failed: 1, stuck: 2 });
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ event: "user.account.deletion_reconcile.failed", userId: pendingUser.id }),
      expect.any(String),
    );
  });
});
