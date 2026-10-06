import { HttpStatus } from "@nestjs/common";
import type { ApiErrorDefinition } from "src/common/errors/api-error.types";

export const EVENT_API_ERRORS = {
  ALREADY_A_MEMBER: {
    status: HttpStatus.CONFLICT,
    message: ({ eventId }: { eventId: string }) => `Caller is already a member of event "${eventId}"`,
  },
  CANNOT_CHANGE_OWN_ROLE: {
    status: HttpStatus.FORBIDDEN,
    message: "Caller cannot change their own access level",
  },
  CANNOT_REMOVE_SELF: {
    status: HttpStatus.FORBIDDEN,
    message: "Caller cannot remove themselves; leaving is a separate endpoint",
  },
  COVER_CHANGED_CONCURRENTLY: {
    status: HttpStatus.CONFLICT,
    message: "Event cover was changed by another request",
  },
  EVENT_UNDER_REVIEW: {
    status: HttpStatus.FORBIDDEN,
    message: "Event is under review",
  },
  LAST_ORGANIZER: {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    message: ({ eventId }: { eventId: string }) => `Event "${eventId}" must keep at least one organizer`,
  },
  NOT_A_MEMBER: {
    status: HttpStatus.FORBIDDEN,
    message: ({ eventId }: { eventId: string }) => `Caller is not a member of event "${eventId}"`,
  },
  ORGANIZER_BLOCKED_BY_CALLER: {
    status: HttpStatus.FORBIDDEN,
    message: ({ organizerName }: { organizerName: string | null }) =>
      `Caller blocked event organizer${organizerName == null ? "" : ` "${organizerName}"`}`,
  },
  ORGANIZER_ONLY: {
    status: HttpStatus.FORBIDDEN,
    message: ({ action, subject }: { action: string; subject: string }) =>
      `Only organizers may ${action} this ${subject}; the caller is a member without that role`,
  },
  REMOVED_FROM_EVENT: {
    status: HttpStatus.FORBIDDEN,
    message: "Caller was removed from the event",
  },
  TARGET_NOT_A_MEMBER: {
    status: HttpStatus.FORBIDDEN,
    message: ({ userId, eventId }: { userId: string; eventId: string }) =>
      `User "${userId}" is not a member of event "${eventId}"`,
  },
} as const satisfies Record<string, ApiErrorDefinition>;
