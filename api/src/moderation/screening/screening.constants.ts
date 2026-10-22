import { ReportReason } from "generated/prisma/client";
import { ModerationLabel } from "src/sdk/aws/rekognition/rekognition.service";

export const DEFAULT_SCREENING_MIN_CONFIDENCE = 80;
export const DEFAULT_SCREENING_TIMEOUT_MS = 5000;

/** The formats Rekognition's image moderation reads. */
export const SCREENABLE_CONTENT_TYPES: readonly string[] = ["image/jpeg", "image/png"];

/**
 * Which of Rekognition's moderation categories file a report, and with what
 * reason (docs/moderation.md §11). A label counts when it, or its parent, is
 * listed; older and newer taxonomy names are both here. Everything else
 * (swimwear, alcohol, rude gestures) is ordinary at a party and files nothing.
 * The first matching row wins, so nudity outranks violence.
 */
export const SCREENING_CATEGORIES: readonly { reason: ReportReason; labels: readonly string[] }[] = [
  {
    reason: ReportReason.NUDITY_OR_SEXUAL,
    labels: ["Explicit", "Explicit Nudity", "Explicit Sexual Activity", "Sexual Activity"],
  },
  {
    reason: ReportReason.VIOLENCE,
    labels: ["Violence", "Graphic Violence", "Graphic Violence Or Gore", "Visually Disturbing"],
  },
  { reason: ReportReason.HARASSMENT, labels: ["Hate Symbols"] },
];

/** What screening concluded about a photo: the reason to file, and the labels that made it, for the reviewer. */
export interface ScreeningVerdict {
  reason: ReportReason;
  labels: ModerationLabel[];
}

export const classifyModerationLabels = (labels: ModerationLabel[]): ScreeningVerdict | null => {
  for (const category of SCREENING_CATEGORIES) {
    const matching = labels.filter(
      (label) => category.labels.includes(label.name) || category.labels.includes(label.parentName),
    );
    if (matching.length > 0) return { reason: category.reason, labels: matching };
  }
  return null;
};

/** The note an automated report carries, so the reviewer sees what screening saw. */
export const screeningNote = (verdict: ScreeningVerdict): string =>
  `Upload screening: ${verdict.labels.map((label) => `${label.name} (${Math.round(label.confidence)}%)`).join(", ")}`.slice(
    0,
    500,
  );
