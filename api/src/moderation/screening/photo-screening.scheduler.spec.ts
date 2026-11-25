import { PinoLogger } from "nestjs-pino";
import { PhotoScreeningScheduler } from "./photo-screening.scheduler";
import { PhotoScreeningService } from "./photo-screening.service";
import { UploadScreeningService } from "./upload-screening.service";

describe("PhotoScreeningScheduler", () => {
  let enabled: boolean;
  let screenHeld: jest.Mock;
  let logger: { setContext: jest.Mock; info: jest.Mock; warn: jest.Mock; error: jest.Mock };
  let scheduler: PhotoScreeningScheduler;

  beforeEach(() => {
    enabled = true;
    screenHeld = jest.fn().mockResolvedValue({ screened: 2, cleared: 2, flagged: 0, skipped: 0, stillHeld: 0 });
    logger = { setContext: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    scheduler = new PhotoScreeningScheduler(
      { screenHeld } as unknown as PhotoScreeningService,
      { isEnabled: () => enabled } as unknown as UploadScreeningService,
      logger as unknown as PinoLogger,
    );
  });

  it("says at boot that new photos aren't checked while screening is off", () => {
    enabled = false;
    scheduler.onApplicationBootstrap();

    expect(logger.warn).toHaveBeenCalledWith({ event: "photo.screening.disabled" }, expect.any(String));
  });

  it("says nothing at boot while screening is on", () => {
    scheduler.onApplicationBootstrap();

    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("runs the held photos and logs the heartbeat with the counts", async () => {
    await scheduler.handleRun();

    expect(screenHeld).toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ event: "photo.screening.run_completed", screened: 2, cleared: 2 }),
      expect.any(String),
    );
  });

  it("doesn't run while screening is off", async () => {
    enabled = false;
    await scheduler.handleRun();

    expect(screenHeld).not.toHaveBeenCalled();
  });

  it("logs a failed run instead of throwing", async () => {
    screenHeld.mockRejectedValue(new Error("database down"));

    await expect(scheduler.handleRun()).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ event: "photo.screening.run_failed" }),
      expect.any(String),
    );
  });
});
