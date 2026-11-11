import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Photo, PhotoScreening, Prisma, Report, ReportTargetType } from "generated/prisma/client";
import { PinoLogger } from "nestjs-pino";
import { ALERT_EVENTS } from "src/common/logging/alert-events.constants";
import { mapWithConcurrency } from "src/common/utils/async.utils";
import { buildPhotoDerivativeS3Keys } from "src/photos/photos.constants";
import { RekognitionService } from "src/sdk/aws/rekognition/rekognition.service";
import { S3Service } from "src/sdk/aws/s3/s3.service";
import { fileAutomatedReport, logAutomatedReport } from "../automated-report";
import { EvidenceService } from "../evidence/evidence.service";
import {
  DERIVATIVE_CONTENT_TYPES,
  REKOGNITION_CONTENT_TYPES,
  REKOGNITION_MAX_IMAGE_BYTES,
  SCREENING_CONCURRENCY,
  ScreeningVerdict,
  classifyModerationLabels,
  screeningNote,
} from "./screening.constants";

/** What screening needs to know about a photo. */
export type ScreenablePhoto = Pick<Photo, "id" | "eventId" | "s3Key" | "contentType" | "sizeBytes" | "addedById">;

/** Why a photo was published unchecked. */
export type ScreeningSkipReason =
  /** HEIC or HEIF: no display copy yet, and Rekognition reads neither (EV-5). */
  | "unsupported_format"
  /** Rekognition refused the image itself; trying again would fail the same way. */
  | "invalid_image"
  /** It stayed unscreenable for the whole hold. */
  | "hold_expired";

/** Why a photo is held for the screening job instead. */
export type ScreeningRetryReason = "no_display_copy" | "timeout" | "error";

export type ScreeningOutcome =
  | { kind: "cleared" }
  | { kind: "flagged"; verdict: ScreeningVerdict }
  | { kind: "skipped"; reason: ScreeningSkipReason }
  | { kind: "retry"; reason: ScreeningRetryReason };

/** A flagged photo and the automated report it got; null when it already had an OPEN one. */
export interface FiledScreeningReport {
  photo: ScreenablePhoto;
  verdict: ScreeningVerdict;
  report: Report | null;
}

// Rekognition errors that depend only on the image: trying again won't help.
const PERMANENT_REKOGNITION_ERRORS = new Set([
  "InvalidImageFormatException",
  "ImageTooLargeException",
  "InvalidParameterException",
]);

/** Rejects when `signal` fires, even if `work` ignores it. */
const untilAborted = <T>(work: Promise<T>, signal: AbortSignal): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason instanceof Error ? signal.reason : new Error("Screening was aborted"));
    if (signal.aborted) return onAbort();
    signal.addEventListener("abort", onAbort, { once: true });
    work.then(resolve, reject).finally(() => signal.removeEventListener("abort", onAbort));
  });

const errorType = (error: unknown): string => (error instanceof Error ? error.name : "UnknownError");

/**
 * Upload screening (docs/moderation.md §11): Amazon Rekognition image
 * moderation on each new photo, before guests can see it.
 *
 * It sends bytes, never a bucket key: the image processor's JPEG display copy
 * (derived/{key}/large.jpg), or the original when that is a JPEG or PNG of
 * 5 MB or less and the display copy isn't there yet. So Rekognition needs no
 * S3 or KMS access, and every photo up to the 25 MB cap fits its 5 MB limit.
 *
 * Nothing here throws: an upload never fails because of screening. A photo
 * that can't be screened now is held (PENDING) and the screening job tries
 * again until its hold runs out. Off unless MODERATION_SCREENING_ENABLED is
 * exactly "true".
 */
@Injectable()
export class UploadScreeningService {
  constructor(
    private readonly configService: ConfigService,
    private readonly s3Service: S3Service,
    private readonly rekognitionService: RekognitionService,
    private readonly evidenceService: EvidenceService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(this.constructor.name);
  }

  isEnabled(): boolean {
    return this.configService.get<boolean>("moderation.screeningEnabled") === true;
  }

  /** Each photo's outcome, a few at a time. Empty while screening is off. */
  async screenAll(photos: readonly ScreenablePhoto[]): Promise<Map<string, ScreeningOutcome>> {
    if (!this.isEnabled() || photos.length === 0) return new Map();

    const outcomes = await mapWithConcurrency(photos, SCREENING_CONCURRENCY, (photo) => this.screenOne(photo));
    return new Map(photos.map((photo, index) => [photo.id, outcomes[index]]));
  }

  /** One photo's outcome. Bounded by SCREENING_TIMEOUT_MS, S3 read included. Never throws. */
  async screenOne(photo: ScreenablePhoto): Promise<ScreeningOutcome> {
    const hasDisplayCopy = DERIVATIVE_CONTENT_TYPES.includes(photo.contentType);
    const originalIsReadable =
      REKOGNITION_CONTENT_TYPES.includes(photo.contentType) && photo.sizeBytes <= REKOGNITION_MAX_IMAGE_BYTES;
    if (!hasDisplayCopy && !originalIsReadable) return { kind: "skipped", reason: "unsupported_format" };

    const signal = AbortSignal.timeout(this.configService.getOrThrow<number>("moderation.screeningTimeoutMs"));
    try {
      let bytes = hasDisplayCopy
        ? await untilAborted(
            this.s3Service.getObjectBytes(buildPhotoDerivativeS3Keys(photo.s3Key).large, { abortSignal: signal }),
            signal,
          )
        : null;
      if (!bytes && originalIsReadable) {
        bytes = await untilAborted(this.s3Service.getObjectBytes(photo.s3Key, { abortSignal: signal }), signal);
      }
      // The image processor hasn't written the display copy yet.
      if (!bytes) return { kind: "retry", reason: "no_display_copy" };

      const labels = await untilAborted(
        this.rekognitionService.detectModerationLabels(
          bytes,
          this.configService.getOrThrow<number>("moderation.screeningMinConfidence"),
          signal,
        ),
        signal,
      );
      const verdict = classifyModerationLabels(labels);
      return verdict ? { kind: "flagged", verdict } : { kind: "cleared" };
    } catch (error) {
      if (signal.aborted) return { kind: "retry", reason: "timeout" };
      if (PERMANENT_REKOGNITION_ERRORS.has(errorType(error))) return { kind: "skipped", reason: "invalid_image" };

      // Only the error's type: SDK errors can echo request details.
      this.logger.warn(
        { event: "photo.screening.failed", photoId: photo.id, eventId: photo.eventId, errorType: errorType(error) },
        "Upload screening failed; the photo is held and the screening job retries it",
      );
      return { kind: "retry", reason: "error" };
    }
  }

  /**
   * The photo columns an outcome sets, to write with the photo's own update.
   * A retry holds it until `now` plus SCREENING_MAX_HOLD_MINUTES; every other
   * outcome ends the hold. No outcome (screening off) sets nothing.
   */
  photoData(outcome: ScreeningOutcome | undefined, now: Date = new Date()): Prisma.PhotoUpdateManyMutationInput {
    switch (outcome?.kind) {
      case undefined:
        return {};
      case "cleared":
        return { screening: PhotoScreening.CLEARED, screeningHeldUntil: null };
      case "flagged":
        return { screening: PhotoScreening.FLAGGED, screeningHeldUntil: null };
      case "skipped":
        return { screening: PhotoScreening.SKIPPED, screeningHeldUntil: null };
      case "retry": {
        const holdMinutes = this.configService.getOrThrow<number>("moderation.screeningMaxHoldMinutes");
        return {
          screening: PhotoScreening.PENDING,
          screeningHeldUntil: new Date(now.getTime() + holdMinutes * 60_000),
        };
      }
    }
  }

  /**
   * Files the automated report of each flagged photo inside `tx`, so the
   * photo is hidden in the same commit that makes it READY. Log the result
   * with `logOutcomes` after the commit.
   */
  async fileReports(
    tx: Prisma.TransactionClient,
    photos: readonly ScreenablePhoto[],
    eventTitle: string,
    outcomes: ReadonlyMap<string, ScreeningOutcome>,
  ): Promise<FiledScreeningReport[]> {
    const filed: FiledScreeningReport[] = [];
    for (const photo of photos) {
      const outcome = outcomes.get(photo.id);
      if (outcome?.kind !== "flagged") continue;

      const report = await fileAutomatedReport(tx, this.evidenceService, {
        eventId: photo.eventId,
        eventTitle,
        targetType: ReportTargetType.PHOTO,
        photoId: photo.id,
        reportedUserId: photo.addedById,
        reason: outcome.verdict.reason,
        note: screeningNote(outcome.verdict),
        snapshot: {
          objectS3Key: photo.s3Key,
          contentType: photo.contentType,
          sizeBytes: photo.sizeBytes,
          subjectUserId: photo.addedById,
        },
      });
      filed.push({ photo, verdict: outcome.verdict, report });
    }
    return filed;
  }

  /**
   * One line per photo that didn't simply clear: flagged (audit, with the
   * automated report's own lines), held, or published unchecked. Label names
   * and confidences only; never the image or the note.
   */
  logOutcomes(
    photos: readonly ScreenablePhoto[],
    outcomes: ReadonlyMap<string, ScreeningOutcome>,
    filed: readonly FiledScreeningReport[],
    context: Record<string, unknown> = {},
  ): void {
    const reports = new Map(filed.map((entry) => [entry.photo.id, entry.report]));
    for (const photo of photos) {
      const outcome = outcomes.get(photo.id);
      const fields = { photoId: photo.id, eventId: photo.eventId, ...context };
      switch (outcome?.kind) {
        case "flagged": {
          const report = reports.get(photo.id) ?? null;
          this.logger.info(
            {
              ...fields,
              event: "photo.screening.flagged",
              reason: outcome.verdict.reason,
              labels: outcome.verdict.labels.map((label) => ({
                name: label.name,
                confidence: Math.round(label.confidence),
              })),
              reportId: report?.id ?? null,
              audit: true,
            },
            "Upload screening flagged a photo; it is hidden until the platform judges it",
          );
          if (report) logAutomatedReport(this.logger, report, { check: "upload_screening" });
          break;
        }
        case "skipped":
          // HEIC and HEIF are skipped by design until they get a display copy, so they don't warn.
          this.logger[outcome.reason === "unsupported_format" ? "info" : "warn"](
            {
              ...fields,
              event: ALERT_EVENTS.PHOTO_SCREENING_SKIPPED,
              reason: outcome.reason,
              contentType: photo.contentType,
            },
            "Photo published without screening",
          );
          break;
        case "retry":
          this.logger.info(
            { ...fields, event: "photo.screening.held", reason: outcome.reason },
            "Photo held until it is screened",
          );
          break;
        default:
          break;
      }
    }
  }
}
