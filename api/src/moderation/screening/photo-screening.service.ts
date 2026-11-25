import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PhotoScreening, PhotoStatus } from "generated/prisma/client";
import { PinoLogger } from "nestjs-pino";
import { runExclusively } from "src/prisma/advisory-lock";
import { PrismaService } from "src/prisma/prisma.service";
import { FiledScreeningReport, ScreeningOutcome, UploadScreeningService } from "./upload-screening.service";

export interface PhotoScreeningRunResult {
  /** Held photos looked at this run. */
  screened: number;
  cleared: number;
  flagged: number;
  /** Published unchecked: a format or image Rekognition can't read, or the hold ran out. */
  skipped: number;
  /** Still held: a later run tries again. */
  stillHeld: number;
  /** Another run, here or on another replica, was still going; this one did nothing. */
  ranElsewhere?: boolean;
}

// One run at a time across replicas (runExclusively): two would send the same
// held photos to Rekognition twice. The timeout is well past a run's length,
// 50 photos four at a time at 5 seconds each.
const SCREENING_LOCK_KEY = "photos:screening";
const SCREENING_LOCK_TIMEOUT_MS = 10 * 60_000;

const emptyResult = (): PhotoScreeningRunResult => ({ screened: 0, cleared: 0, flagged: 0, skipped: 0, stillHeld: 0 });

/**
 * The screening job's work (docs/moderation.md §11): screens photos that
 * confirm had to hold (PENDING), least recently tried first. A photo it
 * still can't screen is moved behind the others, like the hash backfill
 * does, so a batch of photos that never become screenable can't keep the
 * job from the ones behind them. A photo still unscreenable once its hold
 * has run out is published unchecked (SKIPPED); the read filter already
 * shows it by then, so this only records it.
 */
@Injectable()
export class PhotoScreeningService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly uploadScreeningService: UploadScreeningService,
    private readonly configService: ConfigService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(this.constructor.name);
  }

  async screenHeld(now: Date = new Date()): Promise<PhotoScreeningRunResult> {
    const run = await runExclusively(this.prisma, SCREENING_LOCK_KEY, SCREENING_LOCK_TIMEOUT_MS, () =>
      this.screenHeldNow(now),
    );
    return run.ran ? run.result : { ...emptyResult(), ranElsewhere: true };
  }

  private async screenHeldNow(now: Date): Promise<PhotoScreeningRunResult> {
    const result = emptyResult();

    const photos = await this.prisma.photo.findMany({
      where: { status: PhotoStatus.READY, screening: PhotoScreening.PENDING },
      orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
      take: this.configService.getOrThrow<number>("moderation.screeningBatchSize"),
      select: {
        id: true,
        eventId: true,
        s3Key: true,
        contentType: true,
        sizeBytes: true,
        addedById: true,
        screeningHeldUntil: true,
        event: { select: { title: true } },
      },
    });
    if (photos.length === 0) return result;

    const screened = await this.uploadScreeningService.screenAll(photos);
    const outcomes = new Map<string, ScreeningOutcome>();
    for (const photo of photos) {
      const outcome = screened.get(photo.id);
      if (!outcome) continue;
      const holdOver = !photo.screeningHeldUntil || photo.screeningHeldUntil <= now;
      outcomes.set(
        photo.id,
        outcome.kind === "retry" && holdOver ? { kind: "skipped", reason: "hold_expired" } : outcome,
      );
    }

    const recorded = new Map<string, ScreeningOutcome>();
    const filed: FiledScreeningReport[] = [];
    const stillHeld: string[] = [];
    try {
      for (const photo of photos) {
        const outcome = outcomes.get(photo.id);
        result.screened += 1;
        if (!outcome || outcome.kind === "retry") {
          stillHeld.push(photo.id);
          continue;
        }

        try {
          // Only while it is still held: a photo deleted, or screened by another
          // instance's run meanwhile, is left as it is.
          const reports = await this.prisma.$transaction(async (tx) => {
            const { count } = await tx.photo.updateMany({
              where: { id: photo.id, screening: PhotoScreening.PENDING },
              data: this.uploadScreeningService.photoData(outcome, now),
            });
            if (count === 0) return null;
            return this.uploadScreeningService.fileReports(tx, [photo], photo.event.title, outcomes);
          });
          if (!reports) continue;

          recorded.set(photo.id, outcome);
          filed.push(...reports);
          if (outcome.kind === "cleared") result.cleared += 1;
          else if (outcome.kind === "flagged") result.flagged += 1;
          else result.skipped += 1;
        } catch (error) {
          // One photo's write failing leaves it held for the next run, and
          // must not cost the others their verdicts or their log lines.
          stillHeld.push(photo.id);
          this.logger.error(
            { err: error as Error, event: "photo.screening.record_failed", photoId: photo.id, eventId: photo.eventId },
            "Could not record a photo's screening verdict; the next run tries again",
          );
        }
      }

      // Behind the rest of the queue, so the next run starts with photos this one didn't reach.
      if (stillHeld.length > 0) {
        await this.prisma.photo.updateMany({
          where: { id: { in: stillHeld }, screening: PhotoScreening.PENDING },
          data: { updatedAt: now },
        });
      }
    } finally {
      // Whatever happened after them, the verdicts already committed are logged: nothing else announces them.
      this.uploadScreeningService.logOutcomes(photos, recorded, filed, { trigger: "screening_job" });
    }
    result.stillHeld = stillHeld.length;
    return result;
  }
}
