import { Test, TestingModule } from "@nestjs/testing";
import { PinoLogger } from "nestjs-pino";
import { ReportsService } from "./reports.service";
import { StaleReportCheckScheduler } from "./stale-report-check.scheduler";

describe("StaleReportCheckScheduler", () => {
  let scheduler: StaleReportCheckScheduler;
  let reportsService: { reportStaleReports: jest.Mock };
  let logger: { setContext: jest.Mock; info: jest.Mock; error: jest.Mock };

  beforeEach(async () => {
    reportsService = { reportStaleReports: jest.fn().mockResolvedValue({ stale: 2 }) };
    logger = { setContext: jest.fn(), info: jest.fn(), error: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StaleReportCheckScheduler,
        { provide: ReportsService, useValue: reportsService },
        { provide: PinoLogger, useValue: logger },
      ],
    }).compile();

    scheduler = module.get(StaleReportCheckScheduler);
  });

  it("runs the check and logs a heartbeat with its count", async () => {
    await scheduler.handleCheck();

    expect(reportsService.reportStaleReports).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ event: "report.stale_check.run_completed", stale: 2 }),
      expect.any(String),
    );
  });

  it("logs a failed run instead of throwing out of the cron tick", async () => {
    reportsService.reportStaleReports.mockRejectedValue(new Error("db down"));

    await expect(scheduler.handleCheck()).resolves.toBeUndefined();

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ event: "report.stale_check.run_failed" }),
      expect.any(String),
    );
  });
});
