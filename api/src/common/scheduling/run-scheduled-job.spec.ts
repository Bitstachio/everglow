import { PinoLogger } from "nestjs-pino";
import { ALERT_EVENTS } from "src/common/logging/alert-events.constants";
import { runScheduledJob, ScheduledJob } from "./run-scheduled-job";

describe("runScheduledJob", () => {
  let logger: { info: jest.Mock; error: jest.Mock };
  let run: jest.Mock;

  const job = (overrides: Partial<ScheduledJob<object>> = {}): ScheduledJob<object> => ({
    name: "Pending photo cleanup",
    enabled: true,
    completedEvent: ALERT_EVENTS.PHOTO_PENDING_CLEANUP_RUN_COMPLETED,
    failedEvent: ALERT_EVENTS.PHOTO_PENDING_CLEANUP_RUN_FAILED,
    run,
    ...overrides,
  });

  const execute = (overrides?: Partial<ScheduledJob<object>>) =>
    runScheduledJob(logger as unknown as PinoLogger, job(overrides));

  beforeEach(() => {
    logger = { info: jest.fn(), error: jest.fn() };
    run = jest.fn().mockResolvedValue({ scanned: 0, deleted: 0, failed: 0 });
  });

  afterEach(() => jest.restoreAllMocks());

  it.each([false, undefined])("skips the run and logs nothing when enabled is %s", async (enabled) => {
    await execute({ enabled });

    expect(run).not.toHaveBeenCalled();
    expect(logger.info).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("logs one heartbeat with the result counts and the duration, even for an idle run", async () => {
    jest.spyOn(Date, "now").mockReturnValueOnce(1_000).mockReturnValueOnce(1_250);

    await execute();

    expect(run).toHaveBeenCalledTimes(1);
    expect(logger.error).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledWith(
      { event: "photo.pending_cleanup.run_completed", durationMs: 250, scanned: 0, deleted: 0, failed: 0 },
      "Pending photo cleanup run completed",
    );
  });

  it("keeps its own fields when the result carries the same keys", async () => {
    run.mockResolvedValue({ event: "overridden", durationMs: -1 });

    await execute();

    expect(logger.info).toHaveBeenCalledWith(
      { event: "photo.pending_cleanup.run_completed", durationMs: expect.any(Number) as number },
      expect.any(String),
    );
  });

  it("logs one failure event with the error instead of the heartbeat, and does not throw", async () => {
    const error = new Error("db down");
    run.mockRejectedValue(error);
    jest.spyOn(Date, "now").mockReturnValueOnce(1_000).mockReturnValueOnce(1_040);

    await expect(execute()).resolves.toBeUndefined();

    expect(logger.info).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith(
      { err: error, event: "photo.pending_cleanup.run_failed", durationMs: 40 },
      "Pending photo cleanup run failed",
    );
  });

  it("does not throw when the run throws synchronously", async () => {
    run.mockImplementation(() => {
      throw new Error("sync failure");
    });

    await expect(execute()).resolves.toBeUndefined();

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ event: "photo.pending_cleanup.run_failed" }),
      expect.any(String),
    );
  });
});
