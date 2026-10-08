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
