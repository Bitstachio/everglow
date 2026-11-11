import { ReportReason } from "generated/prisma/client";
import type { ModerationLabel } from "src/sdk/aws/rekognition/rekognition.service";

// Upload screening (docs/moderation.md §11). Each default has an env
// override in moderation.config.

// Lowest confidence, in percent, at which Rekognition returns a label.
export const DEFAULT_SCREENING_MIN_CONFIDENCE = 80;

// How long one photo's screen may take, its S3 read included, before it is
// held for the screening job instead.
export const DEFAULT_SCREENING_TIMEOUT_MS = 5000;

// How long a photo that couldn't be screened stays hidden from guests while
// the job retries it. After this it is published unchecked (SKIPPED).
export const DEFAULT_SCREENING_MAX_HOLD_MINUTES = 30;

// Held photos the job screens per run (every minute).
export const DEFAULT_SCREENING_BATCH_SIZE = 50;

// Photos screened at once per confirm or job run, like hashing
// (PHOTO_HASH_CONCURRENCY), so a batch of 20 doesn't hit Rekognition's
// per-second quota all at once.
export const SCREENING_CONCURRENCY = 4;

// Rekognition's limit on an image sent as bytes.
export const REKOGNITION_MAX_IMAGE_BYTES = 5 * 1024 * 1024;

// What Rekognition's image moderation reads.
export const REKOGNITION_CONTENT_TYPES: readonly string[] = ["image/jpeg", "image/png"];

// What the image processor renders a JPEG display copy (large.jpg) for
// (functions/image-processor). It can't decode HEVC HEIC yet; add image/heic
// and image/heif here once it renders them (EV-5), and they are screened too.
export const DERIVATIVE_CONTENT_TYPES: readonly string[] = ["image/jpeg", "image/png", "image/webp"];

/**
 * Which moderation labels file a report, and with what reason. A label counts
 * when it, or its parent, is listed. Names from Rekognition's taxonomy v7,
 * with v6 names kept in case an older model answers. The first matching row
 * wins, so nudity outranks violence.
 *
 * Left out on purpose, because they are ordinary at a party: swimwear and
 * underwear, non-explicit nudity and kissing, weapons on their own,
 * explosions and blasts (fireworks), alcohol, drugs and tobacco, rude
 * gestures, gambling. Rekognition doesn't detect child sexual abuse
 * material, so nothing maps to CHILD_SAFETY.
 */
export const SCREENING_CATEGORIES: readonly { reason: ReportReason; labels: readonly string[] }[] = [
  {
    reason: ReportReason.NUDITY_OR_SEXUAL,
    labels: ["Explicit", "Explicit Nudity", "Explicit Sexual Activity", "Sex Toys", "Sexual Activity"],
  },
  {
    reason: ReportReason.VIOLENCE,
    labels: [
      "Graphic Violence",
      "Weapon Violence",
      "Physical Violence",
      "Self-Harm",
      "Blood & Gore",
      "Death and Emaciation",
      "Graphic Violence Or Gore",
      "Self Injury",
      "Corpses",
      "Emaciated Bodies",
    ],
  },
  { reason: ReportReason.HARASSMENT, labels: ["Hate Symbols", "Nazi Party", "White Supremacy", "Extremist"] },
];

/** What screening concluded about a flagged photo: the reason to file, and the labels that made it. */
export interface ScreeningVerdict {
  reason: ReportReason;
  labels: ModerationLabel[];
}

/** The verdict on a photo's labels, or null when none of them files a report. */
export const classifyModerationLabels = (labels: readonly ModerationLabel[]): ScreeningVerdict | null => {
  for (const category of SCREENING_CATEGORIES) {
    const matching = labels.filter(
      (label) => category.labels.includes(label.name) || category.labels.includes(label.parentName),
    );
    if (matching.length > 0) return { reason: category.reason, labels: matching };
  }
  return null;
};

/** The automated report's note, so the platform's reviewer sees what screening saw. */
export const screeningNote = (verdict: ScreeningVerdict): string =>
  `Upload screening: ${verdict.labels.map((label) => `${label.name} (${Math.round(label.confidence)}%)`).join(", ")}`;
