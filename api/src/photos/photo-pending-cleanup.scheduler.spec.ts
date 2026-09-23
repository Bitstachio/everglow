import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
import { PinoLogger } from "nestjs-pino";
import { PhotoPendingCleanupScheduler } from "./photo-pending-cleanup.scheduler";
import { PhotoPendingCleanupService } from "./photo-pending-cleanup.service";

describe("PhotoPendingCleanupScheduler", () => {
  let scheduler: PhotoPendingCleanupScheduler;
  let cleanupService: { cleanupStalePendingPhotos: jest.Mock };
  let logger: { setContext: jest.Mock; info: jest.Mock; error: jest.Mock };
  let enabled: boolean;

  beforeEach(async () => {
    enabled = true;
    cleanupService = {
      cleanupStalePendingPhotos: jest.fn().mockResolvedValue({
        scanned: 0,
        deleted: 0,
        failed: 0,
        expired: { scanned: 0, released: 0, retained: 0, failed: 0 },
      }),
    };
    logger = { setContext: jest.fn(), info: jest.fn(), error: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PhotoPendingCleanupScheduler,
        { provide: PhotoPendingCleanupService, useValue: cleanupService },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => (key === "photos.pendingCleanupEnabled" ? enabled : undefined)),
          },
        },
        { provide: PinoLogger, useValue: logger },
      ],
    }).compile();

    scheduler = module.get(PhotoPendingCleanupScheduler);
  });

  it("runs the cleanup when enabled and logs a heartbeat with its counts", async () => {
    await scheduler.handleCleanup();

    expect(cleanupService.cleanupStalePendingPhotos).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "photo.pending_cleanup.run_completed",
        durationMs: expect.any(Number) as number,
        scanned: 0,
        failed: 0,
        expired: { scanned: 0, released: 0, retained: 0, failed: 0 },
      }),
      expect.any(String),
    );
  });

  it("does nothing when disabled", async () => {
    enabled = false;

    await scheduler.handleCleanup();

    expect(cleanupService.cleanupStalePendingPhotos).not.toHaveBeenCalled();
    expect(logger.info).not.toHaveBeenCalled();
  });

  it("logs a failed run instead of throwing out of the cron tick", async () => {
    cleanupService.cleanupStalePendingPhotos.mockRejectedValue(new Error("db down"));

    await expect(scheduler.handleCleanup()).resolves.toBeUndefined();

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ event: "photo.pending_cleanup.run_failed" }),
      expect.any(String),
    );
  });
});
