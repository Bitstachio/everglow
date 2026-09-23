import { PinoLogger } from "nestjs-pino";
import { AlertEvent } from "src/common/logging/alert-events.constants";

export interface ScheduledJob<TResult extends object> {
  /** Human name used in the log messages, e.g. "Pending photo cleanup". */
  name: string;
  /** The job's config flag as read; anything but true skips the run without a log line. */
  enabled: boolean | undefined;
  /** Heartbeat logged after every run that returns, idle runs included. */
  completedEvent: AlertEvent;
  /** Logged instead of the heartbeat when the run throws. */
  failedEvent: AlertEvent;
  /** The work. Its result (the job's counts) is spread into the heartbeat. */
  run: () => Promise<TResult>;
}

/**
 * The body of every @Cron handler: skip when disabled, run, then log exactly
 * one line saying how the run ended.
 *
 * The heartbeat is the point. A cron job that stops firing logs no error, so
 * the only way to notice is the absence of a line that every healthy run
 * writes, idle ones included. See docs/alerting.md.
 *
 * Never throws: nothing awaits a cron tick, so an error escaping it would be
 * an unhandled rejection rather than something a caller could act on.
 */
export async function runScheduledJob<TResult extends object>(
  logger: PinoLogger,
  job: ScheduledJob<TResult>,
): Promise<void> {
  if (!job.enabled) return;

  const startedAt = Date.now();
  try {
    const result = await job.run();
    logger.info(
      { ...result, event: job.completedEvent, durationMs: Date.now() - startedAt },
      `${job.name} run completed`,
    );
  } catch (error) {
    logger.error(
      { err: error as Error, event: job.failedEvent, durationMs: Date.now() - startedAt },
      `${job.name} run failed`,
    );
  }
}
