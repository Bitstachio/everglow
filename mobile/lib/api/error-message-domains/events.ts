export const EVENT_ERROR_MESSAGES = {
  COVER_CHANGED_CONCURRENTLY: "Another organizer changed the cover at the same time. Please try again.",
  EVENT_UNDER_REVIEW: "This event is under review. No one can join or add photos until the review is over.",
  ORGANIZER_BLOCKED_BY_CALLER: "This event is organized by someone you blocked. Unblock them to join.",
  REMOVED_FROM_EVENT: "You were removed from this event by an organizer.",
} as const;
