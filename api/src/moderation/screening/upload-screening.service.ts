import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Photo } from "generated/prisma/client";
import { PinoLogger } from "nestjs-pino";
import { RekognitionService } from "src/sdk/aws/rekognition/rekognition.service";
import { ReportsService } from "../reports.service";
import { SCREENABLE_CONTENT_TYPES, classifyModerationLabels, screeningNote } from "./screening.constants";

export type ScreenedPhoto = Pick<Photo, "id" | "eventId" | "s3Key" | "contentType" | "sizeBytes" | "addedById">;

/**
 * Screens photos as their upload is confirmed (docs/moderation.md §11). A
 * photo Rekognition flags gets an automated report in the platform's queue,
 * which hides it from everyone but organizers before anyone else has seen
 * it. Screening fails open: a photo it can't check is published, never held
 * up, and the failure is logged. Off unless MODERATION_SCREENING_ENABLED is
 * exactly "true".
 */
@Injectable()
export class UploadScreeningService {
  constructor(
    private readonly configService: ConfigService,
    private readonly rekognitionService: RekognitionService,
    private readonly reportsService: ReportsService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(this.constructor.name);
  }

  /** Never throws: an upload never waits on, or fails because of, screening. */
  async screen(photos: ScreenedPhoto[]): Promise<void> {
    if (photos.length === 0 || this.configService.get<boolean>("moderation.screeningEnabled") !== true) return;

    await Promise.all(photos.map((photo) => this.screenOne(photo)));
  }

  private async screenOne(photo: ScreenedPhoto): Promise<void> {
    // Rekognition reads JPEG and PNG only. A HEIC or WebP photo, which is
    // what iPhones upload, is published unscreened, and the log says so.
    if (!SCREENABLE_CONTENT_TYPES.includes(photo.contentType)) {
      this.logger.info(
        { event: "photo.screening.skipped", photoId: photo.id, contentType: photo.contentType },
        "Photo format can't be screened; published unscreened",
      );
      return;
    }

    const minConfidence = this.configService.getOrThrow<number>("moderation.screeningMinConfidence");
    const timeoutMs = this.configService.getOrThrow<number>("moderation.screeningTimeoutMs");
    try {
      const labels = await withTimeout(
        this.rekognitionService.detectModerationLabels(photo.s3Key, minConfidence),
        timeoutMs,
      );
      const verdict = classifyModerationLabels(labels);
      if (!verdict) return;

      await this.reportsService.fileAutomatedReport(photo, verdict.reason, screeningNote(verdict));
    } catch (error) {
      this.logger.warn(
        { err: error as Error, event: "photo.screening.failed", photoId: photo.id, eventId: photo.eventId },
        "Upload screening failed; the photo is published unscreened",
      );
    }
  }
}

const withTimeout = <T>(work: Promise<T>, timeoutMs: number): Promise<T> => {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Screening took longer than ${timeoutMs} ms`)), timeoutMs);
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
};
