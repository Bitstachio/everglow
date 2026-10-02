import { RESPONSE_TEMPLATES } from "src/common/constants/templates.constants";

const userEntity = "User";
const eventEntity = "Event";

export const EVENT_SERVICE_ERRORS = {
  CREATOR_NOT_FOUND: (id: string) => RESPONSE_TEMPLATES.RESOURCE.NOT_FOUND(userEntity, "ID", id),
  CALLER_NOT_FOUND: (id: string) => RESPONSE_TEMPLATES.RESOURCE.NOT_FOUND(userEntity, "ID", id),
  NOT_FOUND: (id: string) => RESPONSE_TEMPLATES.RESOURCE.NOT_FOUND(eventEntity, "ID", id),
  INVITATION_NOT_FOUND: (invitationUrl: string) => `Event with invitation URL "${invitationUrl}" not found`,
  INVITE_NOT_FOUND: (eventId: string, accessLevel: string) =>
    `Invite for access level "${accessLevel}" on event with ID "${eventId}" not found`,
  ALREADY_JOINED: (eventId: string) => `User has already joined event with ID "${eventId}"`,
  CREATE_FORBIDDEN: "Not authorized to create events",
  DELETE_FORBIDDEN: (eventId: string) => `Not authorized to delete event with ID "${eventId}"`,
  UPDATE_FORBIDDEN: (eventId: string) => `Not authorized to update event with ID "${eventId}"`,
  READ_FORBIDDEN: (eventId: string) => `Not authorized to read event with ID "${eventId}"`,
  NOT_A_MEMBER: (eventId: string, userId: string) =>
    `User with ID "${userId}" is not a member of event with ID "${eventId}"`,
  LAST_ORGANIZER: (eventId: string) => `Event with ID "${eventId}" must have at least one organizer`,
  CANNOT_MODIFY_OWN_ACCESS: "Cannot change your own access level; use leaveEvent instead",
  CANNOT_REMOVE_SELF: "Use leaveEvent to remove yourself from an event",
  COVER_CHANGED_CONCURRENTLY: "The event cover was changed by another request, please retry",
  ORGANIZER_BLOCKED_BY_CALLER: (organizerName: string | null) =>
    `This event is organized by ${organizerName ?? "someone"} you blocked. Unblock them to join.`,
  REMOVED_FROM_EVENT: "You were removed from this event by an organizer.",
  UNDER_REVIEW: "This event is under review. No one can join it or add photos until the review is over.",
  DATE_TOO_FAR_AHEAD: (months: number) => `An event's date can be at most ${months} months ahead.`,
};

// How far ahead an event's date can be. Any past date is allowed: its gallery
// opens when the event is created (docs/event-quotas.md).
export const EVENT_DATE_MAX_MONTHS_AHEAD = 12;

/** The latest date an event can have, EVENT_DATE_MAX_MONTHS_AHEAD months from `now`. */
export const latestEventDate = (now: Date = new Date()): Date => {
  const latest = new Date(now);
  latest.setUTCMonth(latest.getUTCMonth() + EVENT_DATE_MAX_MONTHS_AHEAD);
  return latest;
};

// The joiner blocked an organizer of the event they are joining; see docs/moderation.md.
export const ORGANIZER_BLOCKED_BY_CALLER_CODE = "ORGANIZER_BLOCKED_BY_CALLER";

// An organizer removed the joiner, which bans them until an organizer lifts it; see docs/moderation.md.
export const REMOVED_FROM_EVENT_CODE = "REMOVED_FROM_EVENT";

// Members reported the event itself often enough that the platform is
// reviewing it: joins and new photos are refused; see docs/moderation.md.
export const EVENT_UNDER_REVIEW_CODE = "EVENT_UNDER_REVIEW";

// An event's moderation status, derived from Event.underReviewAt.
export const EVENT_STATUSES = {
  ACTIVE: "ACTIVE",
  UNDER_REVIEW: "UNDER_REVIEW",
} as const;

export type EventStatus = (typeof EVENT_STATUSES)[keyof typeof EVENT_STATUSES];

// event-covers/{eventId}/{uploadId}; see docs/image-uploads.md.
export const EVENT_COVER_S3_KEY_PREFIX = "event-covers/";
