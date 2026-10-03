import { HttpStatus } from "@nestjs/common";
import type { ApiErrorDefinition } from "src/common/errors/api-error.types";

export const EVENT_API_ERRORS = {
  COVER_CHANGED_CONCURRENTLY: {
    status: HttpStatus.CONFLICT,
    message: "Event cover was changed by another request",
  },
  EVENT_UNDER_REVIEW: {
    status: HttpStatus.FORBIDDEN,
    message: "Event is under review",
  },
  ORGANIZER_BLOCKED_BY_CALLER: {
    status: HttpStatus.FORBIDDEN,
    message: ({ organizerName }: { organizerName: string | null }) =>
      `Caller blocked event organizer${organizerName == null ? "" : ` "${organizerName}"`}`,
  },
  REMOVED_FROM_EVENT: {
    status: HttpStatus.FORBIDDEN,
    message: "Caller was removed from the event",
  },
} as const satisfies Record<string, ApiErrorDefinition>;
