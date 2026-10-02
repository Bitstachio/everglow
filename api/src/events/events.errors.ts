import { HttpStatus } from "@nestjs/common";
import type { ApiErrorDefinition, ApiErrorParams } from "src/common/errors/api-error.types";
import { EVENT_UNDER_REVIEW_CODE, ORGANIZER_BLOCKED_BY_CALLER_CODE, REMOVED_FROM_EVENT_CODE } from "./events.constants";

export const EVENT_API_ERRORS = {
  [EVENT_UNDER_REVIEW_CODE]: {
    status: HttpStatus.FORBIDDEN,
    message: "Event is under review",
  },
  [ORGANIZER_BLOCKED_BY_CALLER_CODE]: {
    status: HttpStatus.FORBIDDEN,
    message: ({ organizerName }: ApiErrorParams) =>
      `Caller blocked event organizer${organizerName == null ? "" : ` "${String(organizerName)}"`}`,
  },
  [REMOVED_FROM_EVENT_CODE]: {
    status: HttpStatus.FORBIDDEN,
    message: "Caller was removed from the event",
  },
} as const satisfies Record<string, ApiErrorDefinition>;
