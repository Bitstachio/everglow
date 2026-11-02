import { Prisma, ReportHoldReason } from "generated/prisma/client";

/**
 * `ReportEvidence.subjectUsername` says who a report was about after the
 * account is gone, and goes when the account does (docs/account-deletion.md
 * §6a), except while one of these holds is running: a child-safety report or
 * a law-enforcement preservation request may need to name the account. The
 * daily evidence job scrubs it once the hold ends.
 */
export const SUBJECT_USERNAME_HOLD_REASONS: ReportHoldReason[] = [
  ReportHoldReason.CHILD_SAFETY,
  ReportHoldReason.LAW_ENFORCEMENT,
];

/** True while a report's hold keeps its subject's username after the account is deleted. */
export const holdKeepsSubjectUsername = (
  report: { holdReason: ReportHoldReason | null; holdUntil: Date | null },
  now: Date,
): boolean =>
  report.holdReason !== null &&
  SUBJECT_USERNAME_HOLD_REASONS.includes(report.holdReason) &&
  report.holdUntil !== null &&
  report.holdUntil > now;

/**
 * The reports whose subject's username may be scrubbed now: the negation of
 * holdKeepsSubjectUsername, spelled out branch by branch because SQL's NOT
 * over a null column matches nothing.
 */
export const subjectUsernameScrubbable = (now: Date): Prisma.ReportWhereInput => ({
  OR: [
    { holdReason: null },
    { holdReason: { notIn: SUBJECT_USERNAME_HOLD_REASONS } },
    { holdUntil: null },
    { holdUntil: { lte: now } },
  ],
});
