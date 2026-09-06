import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
import { PinoLogger } from "nestjs-pino";
import { PhotoOrphanReconcilerScheduler } from "./photo-orphan-reconciler.scheduler";
import { PhotoOrphanReconcilerService } from "./photo-orphan-reconciler.service";

describe("PhotoOrphanReconcilerScheduler", () => {
  let scheduler: PhotoOrphanReconcilerScheduler;
  let reconcilerService: { reconcileOrphanedObjects: jest.Mock };
  let logger: { setContext: jest.Mock; info: jest.Mock; error: jest.Mock };
  let enabled: boolean;

  beforeEach(async () => {
    enabled = true;
    reconcilerService = {
      reconcileOrphanedObjects: jest
        .fn()
        .mockResolvedValue({ scanned: 0, skipped: 0, deleted: 0, failed: 0, completed: true }),
    };
    logger = { setContext: jest.fn(), info: jest.fn(), error: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PhotoOrphanReconcilerScheduler,
        { provide: PhotoOrphanReconcilerService, useValue: reconcilerService },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => (key === "photos.orphanReconcilerEnabled" ? enabled : undefined)),
          },
        },
        { provide: PinoLogger, useValue: logger },
      ],
    }).compile();

    scheduler = module.get(PhotoOrphanReconcilerScheduler);
  });

  it("runs the reconciler when enabled", async () => {
    await scheduler.handleReconcile();

    expect(reconcilerService.reconcileOrphanedObjects).toHaveBeenCalledTimes(1);
  });

  it("does nothing when disabled", async () => {
    enabled = false;

    await scheduler.handleReconcile();

    expect(reconcilerService.reconcileOrphanedObjects).not.toHaveBeenCalled();
  });

  it("logs a failed run instead of throwing out of the cron tick", async () => {
    reconcilerService.reconcileOrphanedObjects.mockRejectedValue(new Error("list failed"));

    await expect(scheduler.handleReconcile()).resolves.toBeUndefined();

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ event: "photo.orphan_reconcile.run_failed" }),
      expect.any(String),
    );
  });
});
