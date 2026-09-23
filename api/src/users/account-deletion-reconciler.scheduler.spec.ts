import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
import { PinoLogger } from "nestjs-pino";
import { AccountDeletionReconcilerScheduler } from "./account-deletion-reconciler.scheduler";
import { AccountDeletionReconcilerService } from "./account-deletion-reconciler.service";

describe("AccountDeletionReconcilerScheduler", () => {
  let scheduler: AccountDeletionReconcilerScheduler;
  let reconcilerService: { reconcilePendingDeletions: jest.Mock };
  let logger: { setContext: jest.Mock; info: jest.Mock; warn: jest.Mock; error: jest.Mock };
  let enabled: boolean;

  beforeEach(async () => {
    enabled = true;
    reconcilerService = {
      reconcilePendingDeletions: jest.fn().mockResolvedValue({ scanned: 0, deleted: 0, failed: 0, stuck: 0 }),
    };
    logger = { setContext: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };

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

  it("warns at boot when the job is disabled, since a failed deletion then never finishes", () => {
    enabled = false;

    scheduler.onApplicationBootstrap();

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ event: "user.account.deletion_reconciler.disabled" }),
      expect.stringContaining("ACCOUNT_DELETION_RECONCILER_ENABLED"),
    );
  });

  it("says nothing at boot when the job is enabled", () => {
    scheduler.onApplicationBootstrap();

    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("runs the reconciler when enabled and logs a heartbeat with its counts", async () => {
    await scheduler.handleReconcile();

    expect(reconcilerService.reconcilePendingDeletions).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "user.account.deletion_reconcile.run_completed",
        durationMs: expect.any(Number) as number,
        scanned: 0,
        failed: 0,
      }),
      expect.any(String),
    );
  });

  it("does nothing when disabled", async () => {
    enabled = false;

    await scheduler.handleReconcile();

    expect(reconcilerService.reconcilePendingDeletions).not.toHaveBeenCalled();
    expect(logger.info).not.toHaveBeenCalled();
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
