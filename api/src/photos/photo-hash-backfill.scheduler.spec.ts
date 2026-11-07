import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
import { PinoLogger } from "nestjs-pino";
import { PhotoHashBackfillScheduler } from "./photo-hash-backfill.scheduler";
import { PhotoHashBackfillService } from "./photo-hash-backfill.service";

describe("PhotoHashBackfillScheduler", () => {
  let scheduler: PhotoHashBackfillScheduler;
  let backfill: { runBackfill: jest.Mock };
  let logger: { setContext: jest.Mock; info: jest.Mock; warn: jest.Mock; error: jest.Mock };
  let enabled: boolean;

  const idleRun = { hashed: 0, failed: 0, removedImageMatches: 0 };

  beforeEach(async () => {
    enabled = true;
    backfill = { runBackfill: jest.fn().mockResolvedValue(idleRun) };
    logger = { setContext: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PhotoHashBackfillScheduler,
        { provide: PhotoHashBackfillService, useValue: backfill },
        {
          provide: ConfigService,
          useValue: { get: jest.fn((key: string) => (key === "photos.hashBackfillEnabled" ? enabled : undefined)) },
        },
        { provide: PinoLogger, useValue: logger },
      ],
    }).compile();

    scheduler = module.get(PhotoHashBackfillScheduler);
  });

  it("warns at boot when the job is disabled, since unhashed photos are then never matched", () => {
    enabled = false;

    scheduler.onApplicationBootstrap();

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ event: "photo.hash_backfill.disabled" }),
      expect.stringContaining("PHOTO_HASH_BACKFILL_ENABLED"),
    );
  });

  it("says nothing at boot when the job is enabled", () => {
    scheduler.onApplicationBootstrap();

    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("runs when enabled and logs a heartbeat with the run's counts, idle runs included", async () => {
    await scheduler.handleRun();

    expect(backfill.runBackfill).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ ...idleRun, event: "photo.hash_backfill.run_completed" }),
      expect.any(String),
    );
  });

  it("does nothing when disabled", async () => {
    enabled = false;

    await scheduler.handleRun();

    expect(backfill.runBackfill).not.toHaveBeenCalled();
  });

  it("logs a failed run instead of throwing out of the cron tick", async () => {
    backfill.runBackfill.mockRejectedValue(new Error("db down"));

    await expect(scheduler.handleRun()).resolves.toBeUndefined();

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ event: "photo.hash_backfill.run_failed" }),
      expect.any(String),
    );
  });
});
