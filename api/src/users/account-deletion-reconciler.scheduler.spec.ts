import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
import { PinoLogger } from "nestjs-pino";
import { AccountDeletionReconcilerScheduler } from "./account-deletion-reconciler.scheduler";
import { AccountDeletionReconcilerService } from "./account-deletion-reconciler.service";

describe("AccountDeletionReconcilerScheduler", () => {
  let scheduler: AccountDeletionReconcilerScheduler;
  let reconcilerService: { reconcilePendingDeletions: jest.Mock };
  let logger: { setContext: jest.Mock; info: jest.Mock; error: jest.Mock };
  let enabled: boolean;

  beforeEach(async () => {
    enabled = true;
    reconcilerService = {
      reconcilePendingDeletions: jest.fn().mockResolvedValue({ scanned: 0, deleted: 0, failed: 0, stuck: 0 }),
    };
    logger = { setContext: jest.fn(), info: jest.fn(), error: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AccountDeletionReconcilerScheduler,
        { provide: AccountDeletionReconcilerService, useValue: reconcilerService },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => (key === "users.accountDeletionReconcilerEnabled" ? enabled : undefined)),
          },
        },
        { provide: PinoLogger, useValue: logger },
      ],
    }).compile();

    scheduler = module.get(AccountDeletionReconcilerScheduler);
  });

  it("runs the reconciler when enabled", async () => {
    await scheduler.handleReconcile();

    expect(reconcilerService.reconcilePendingDeletions).toHaveBeenCalledTimes(1);
  });

  it("does nothing when disabled", async () => {
    enabled = false;

    await scheduler.handleReconcile();

    expect(reconcilerService.reconcilePendingDeletions).not.toHaveBeenCalled();
  });

  it("logs a failed run instead of throwing out of the cron tick", async () => {
    reconcilerService.reconcilePendingDeletions.mockRejectedValue(new Error("db down"));

    await expect(scheduler.handleReconcile()).resolves.toBeUndefined();

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ event: "user.account.deletion_reconcile.run_failed" }),
      expect.any(String),
    );
  });
});
