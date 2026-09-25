import { ReportReason, ReportStatus } from "generated/prisma/client";
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

// Reasons that are escalated to the platform owner whatever the organizers do.
export const SEVERE_REPORT_REASONS: readonly ReportReason[] = [ReportReason.NUDITY_OR_SEXUAL, ReportReason.VIOLENCE];

// The outcomes an organizer can give a report; OPEN is not one of them.
export const REPORT_RESOLUTIONS = [ReportStatus.ACTIONED, ReportStatus.DISMISSED] as const;

export type ReportResolution = (typeof REPORT_RESOLUTIONS)[number];

// Why a report was escalated (the `escalationReasons` field of `report.escalated`).
export const REPORT_ESCALATION_REASONS = {
  SEVERE_REASON: "severe_reason",
  TARGET_IS_ORGANIZER: "target_is_organizer",
  HIDE_THRESHOLD_REACHED: "hide_threshold_reached",
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
};

export const BLOCK_SERVICE_ERRORS = {
  CANNOT_BLOCK_SELF: "Cannot block yourself",
};
