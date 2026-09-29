import { ReportClosedReason, ReportReason, ReportStatus } from "generated/prisma/client";
import { RESPONSE_TEMPLATES } from "src/common/constants/templates.constants";

const reportEntity = "Report";

// Matches Report.note VarChar(500) in the Prisma schema.
export const REPORT_NOTE_MAX_LENGTH = 500;

// OPEN reports on one photo, each by a different member, that hide it from
// everyone but the event's organizers. Three keeps a single member, or a pair
// acting together, from taking a photo down for the whole event.
export const REPORT_HIDE_THRESHOLD = 3;

// An event with fewer than REPORT_HIDE_THRESHOLD members besides the uploader
// could never reach it, so two reports are enough there. Never one: a lone
// report only ever hides the photo from its reporter.
export const SMALL_EVENT_REPORT_HIDE_THRESHOLD = 2;

/** The hide threshold for an event of `memberCount` members, uploader included. */
export const reportHideThreshold = (memberCount: number): number =>
  memberCount - 1 < REPORT_HIDE_THRESHOLD ? SMALL_EVENT_REPORT_HIDE_THRESHOLD : REPORT_HIDE_THRESHOLD;

// The share of an event's members whose OPEN event reports, none of them
// severe, put the event under review. A floor of reportHideThreshold keeps
// small events as they are; above 30 members it grows, so a few members of a
// large event cannot pause it with spam reports (docs/moderation.md).
export const UNDER_REVIEW_MEMBER_SHARE = 0.1;

// Reasons that hide a photo from every non-organizer after a single OPEN
// report, and that are escalated to the platform owner whatever the
// organizers do. The harm of leaving such a photo up in a private album
// outweighs the cost of a wrong report, which a dismissal undoes.
export const SEVERE_REPORT_REASONS: readonly ReportReason[] = [ReportReason.NUDITY_OR_SEXUAL, ReportReason.VIOLENCE];

/**
 * OPEN event reports that put an event of `memberCount` members under review.
 * Any severe report among them keeps it at the photo hide threshold.
 */
export const underReviewThreshold = (memberCount: number, anySevere: boolean): number => {
  const floor = reportHideThreshold(memberCount);
  return anySevere ? floor : Math.max(floor, Math.ceil(memberCount * UNDER_REVIEW_MEMBER_SHARE));
};

// What an organizer does with a report. Every action closes all OPEN reports
// on the same target, not just the one acted on (docs/moderation.md).
export const REPORT_RESOLUTION_ACTIONS = {
  REMOVE_PHOTO: "REMOVE_PHOTO",
  REMOVE_MEMBER: "REMOVE_MEMBER",
  DISMISS: "DISMISS",
} as const;

export type ReportResolutionAction = (typeof REPORT_RESOLUTION_ACTIONS)[keyof typeof REPORT_RESOLUTION_ACTIONS];

/** The status a report ends up in for each action. */
export const RESOLUTION_STATUS: Record<ReportResolutionAction, ReportStatus> = {
  REMOVE_PHOTO: ReportStatus.ACTIONED,
  REMOVE_MEMBER: ReportStatus.ACTIONED,
  DISMISS: ReportStatus.DISMISSED,
};

/** How each action records the reports it closes. */
export const RESOLUTION_CLOSED_REASON: Record<ReportResolutionAction, ReportClosedReason> = {
  REMOVE_PHOTO: ReportClosedReason.PHOTO_REMOVED,
  REMOVE_MEMBER: ReportClosedReason.MEMBER_REMOVED,
  DISMISS: ReportClosedReason.DISMISSED,
};

// An OPEN report older than this pages the platform owner: the organizers have
// not acted, or cannot (the report is about the only organizer).
export const STALE_REPORT_AFTER_HOURS = 24;

// How many stale report ids one alert line lists; the count is always exact.
export const STALE_REPORT_SAMPLE_SIZE = 20;

// Why a report was escalated (the `escalationReasons` field of `report.escalated`).
export const REPORT_ESCALATION_REASONS = {
  SEVERE_REASON: "severe_reason",
  TARGET_IS_ORGANIZER: "target_is_organizer",
  TARGET_IS_SOLE_ORGANIZER: "target_is_sole_organizer",
  HIDE_THRESHOLD_REACHED: "hide_threshold_reached",
  // Every report about an event: it is the organizers' own content, so only
  // the platform owner reviews it.
  TARGET_IS_EVENT: "target_is_event",
  // This report brought the event's OPEN event reports to its hide threshold,
  // and the event went under review. Urgent: joins and uploads are now refused.
  EVENT_UNDER_REVIEW: "event_under_review",
} as const;

export type ReportEscalationReason = (typeof REPORT_ESCALATION_REASONS)[keyof typeof REPORT_ESCALATION_REASONS];

export const REPORT_SERVICE_ERRORS = {
  NOT_FOUND: (id: string) => RESPONSE_TEMPLATES.RESOURCE.NOT_FOUND(reportEntity, "ID", id),
  CREATE_FORBIDDEN: (eventId: string) => `Not authorized to report content in event with ID "${eventId}"`,
  LIST_FORBIDDEN: (eventId: string) => `Not authorized to list reports of event with ID "${eventId}"`,
  RESOLVE_FORBIDDEN: (reportId: string) => `Not authorized to resolve report with ID "${reportId}"`,
  CANNOT_REPORT_SELF: "Cannot report yourself or your own photo",
  CANNOT_RESOLVE_OWN: "Cannot resolve a report made against you; another organizer has to",
  ALREADY_RESOLVED: (reportId: string) => `Report with ID "${reportId}" has already been resolved`,
  CREATE_CONFLICT: "Report conflicted with a concurrent change, please retry",
  REMOVE_PHOTO_NOT_A_PHOTO_REPORT: "REMOVE_PHOTO only applies to a report about a photo",
  PHOTOS_ONLY_WITH_REMOVE_MEMBER: "photos only applies to REMOVE_MEMBER",
  REPORTED_PHOTO_GONE: "The reported photo no longer exists; dismiss the report instead",
  REPORTED_MEMBER_GONE: "The reported account no longer exists; dismiss the report instead",
};

export const BLOCK_SERVICE_ERRORS = {
  CANNOT_BLOCK_SELF: "Cannot block yourself",
};
