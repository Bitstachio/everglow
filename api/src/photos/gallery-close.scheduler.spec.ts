import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
import { PinoLogger } from "nestjs-pino";
import { GalleryCloseScheduler } from "./gallery-close.scheduler";
import { GalleryCloseService } from "./gallery-close.service";

describe("GalleryCloseScheduler", () => {
  let scheduler: GalleryCloseScheduler;
  let galleryCloseService: { closeDueGalleries: jest.Mock };
  let logger: { setContext: jest.Mock; info: jest.Mock; warn: jest.Mock; error: jest.Mock };
  let enabled: boolean;

  const idleRun = { closed: 0, swept: 0, photosRemoved: 0, bytesRemoved: "0", photosKept: 0, failed: 0 };

  beforeEach(async () => {
    enabled = true;
    galleryCloseService = { closeDueGalleries: jest.fn().mockResolvedValue(idleRun) };
    logger = { setContext: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GalleryCloseScheduler,
        { provide: GalleryCloseService, useValue: galleryCloseService },
        {
          provide: ConfigService,
          useValue: { get: jest.fn((key: string) => (key === "photos.galleryCloseEnabled" ? enabled : undefined)) },
        },
        { provide: PinoLogger, useValue: logger },
      ],
    }).compile();

    scheduler = module.get(GalleryCloseScheduler);
  });

  it("warns at boot when the job is disabled, since closed galleries then keep their photos", () => {
    enabled = false;

    scheduler.onApplicationBootstrap();

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ event: "event.gallery_close.disabled" }),
      expect.stringContaining("GALLERY_CLOSE_ENABLED"),
    );
  });

  it("says nothing at boot when the job is enabled", () => {
    scheduler.onApplicationBootstrap();

    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("closes due galleries when enabled and logs a heartbeat with the run's counts, idle runs included", async () => {
    await scheduler.handleClose();

    expect(galleryCloseService.closeDueGalleries).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ ...idleRun, event: "event.gallery_close.run_completed" }),
      expect.any(String),
    );
  });

  it("does nothing when disabled", async () => {
    enabled = false;

    await scheduler.handleClose();

    expect(galleryCloseService.closeDueGalleries).not.toHaveBeenCalled();
    expect(logger.info).not.toHaveBeenCalled();
  });

  it("logs a failed run instead of throwing out of the cron tick", async () => {
    galleryCloseService.closeDueGalleries.mockRejectedValue(new Error("db down"));

    await expect(scheduler.handleClose()).resolves.toBeUndefined();

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ event: "event.gallery_close.run_failed" }),
      expect.any(String),
    );
  });
});
