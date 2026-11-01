import type { ReportReason } from "../types";

/** What a report is about: a frame, a person on the roll, or the roll itself. */
export type ReportTarget = "frame" | "person" | "roll";

/** Reasons only Everglow's safety team sees: hosts are never shown them, nor what they're about. */
const EVERGLOW_ONLY: readonly ReportReason[] = ["CHILD_SAFETY", "NON_CONSENSUAL_INTIMATE_IMAGE"];

/**
 * The reasons each ticket offers, in printed order (10.1, 10.5, 10.6). A
 * person can't be reported for an intimate image, since there is no image
 * (the API answers 400), and "pretending to be someone" waits on EV-170.
 */
export const REPORT_REASONS = {
  frame: [
    "SPAM",
    "NUDITY_OR_SEXUAL",
    "HARASSMENT",
    "VIOLENCE",
    "OTHER",
    "CHILD_SAFETY",
    "NON_CONSENSUAL_INTIMATE_IMAGE",
  ],
  person: ["SPAM", "HARASSMENT", "VIOLENCE", "OTHER", "CHILD_SAFETY"],
  roll: [
    "SPAM",
    "NUDITY_OR_SEXUAL",
    "HARASSMENT",
    "VIOLENCE",
    "OTHER",
    "CHILD_SAFETY",
    "NON_CONSENSUAL_INTIMATE_IMAGE",
  ],
} as const satisfies Record<ReportTarget, readonly ReportReason[]>;

export const goesOnlyToEverglow = (reason: ReportReason) => EVERGLOW_ONLY.includes(reason);

/** The last reason above the "Goes straight to Everglow" rule. */
export const lastHostReason = (target: ReportTarget): ReportReason | undefined =>
  REPORT_REASONS[target].filter((reason) => !goesOnlyToEverglow(reason)).at(-1);

/** The longest note the API keeps. */
export const REPORT_NOTE_MAX = 500;
