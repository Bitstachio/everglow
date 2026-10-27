import type { ApiErrorCode } from "src/common/errors/api-error-codes";

// How far ahead an event's date can be. Any past date is allowed: its gallery
// opens when the event is created (docs/event-quotas.md).
export const EVENT_DATE_MAX_MONTHS_AHEAD = 12;

/** The latest date an event can have, EVENT_DATE_MAX_MONTHS_AHEAD months from `now`. */
export const latestEventDate = (now: Date = new Date()): Date => {
  const latest = new Date(now);
  latest.setUTCMonth(latest.getUTCMonth() + EVENT_DATE_MAX_MONTHS_AHEAD);
  return latest;
};

// An event's moderation status, derived from Event.underReviewAt.
export const EVENT_STATUSES = {
  ACTIVE: "ACTIVE",
  UNDER_REVIEW: "UNDER_REVIEW",
  // The platform suspended it (docs/moderation.md §8): hidden and read-only.
  SUSPENDED: "SUSPENDED",
} as const;

export type EventStatus = (typeof EVENT_STATUSES)[keyof typeof EVENT_STATUSES];

// event-covers/{eventId}/{uploadId}; see docs/image-uploads.md.
export const EVENT_COVER_S3_KEY_PREFIX = "event-covers/";

/**
 * What an invite would do for the caller (GET /events/invites/:token/preview):
 * JOINABLE, or the code POST /events/join would refuse with, so a client maps
 * both the same way. An organizer's block on the caller is not a state: it
 * reads as an unknown link (404), as on join (docs/moderation.md §6).
 */
export const INVITE_PREVIEW_STATES = {
  JOINABLE: "JOINABLE",
  ALREADY_A_MEMBER: "ALREADY_A_MEMBER",
  EVENT_GALLERY_CLOSED: "EVENT_GALLERY_CLOSED",
  REMOVED_FROM_EVENT: "REMOVED_FROM_EVENT",
  EVENT_SUSPENDED: "EVENT_SUSPENDED",
  EVENT_UNDER_REVIEW: "EVENT_UNDER_REVIEW",
  ORGANIZER_BLOCKED_BY_CALLER: "ORGANIZER_BLOCKED_BY_CALLER",
  EVENT_MEMBER_LIMIT_REACHED: "EVENT_MEMBER_LIMIT_REACHED",
} as const satisfies Record<string, ApiErrorCode | "JOINABLE">;

export type InvitePreviewState = (typeof INVITE_PREVIEW_STATES)[keyof typeof INVITE_PREVIEW_STATES];
