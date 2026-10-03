import { HttpStatus } from "@nestjs/common";
import type { ApiErrorDefinition } from "src/common/errors/api-error.types";

export const PLAN_API_ERRORS = {
  ACTIVE_EVENT_LIMIT_REACHED: {
    status: HttpStatus.FORBIDDEN,
    message: ({ limit }: { limit: number }) => `Active event limit reached (${limit})`,
  },
  EVENT_GALLERY_CLOSED: {
    status: HttpStatus.FORBIDDEN,
    message: "Event gallery is closed",
  },
  EVENT_GALLERY_NOT_OPEN: {
    status: HttpStatus.FORBIDDEN,
    message: "Event gallery is not open",
  },
  EVENT_MEMBER_LIMIT_REACHED: {
    status: HttpStatus.FORBIDDEN,
    message: ({ limit }: { limit: number }) => `Event member limit reached (${limit})`,
  },
  EVENT_SCHEDULE_LOCKED: {
    status: HttpStatus.FORBIDDEN,
    message: "Event schedule is locked",
  },
  EVENT_STILL_ACTIVE: {
    status: HttpStatus.FORBIDDEN,
    message: "Event is still active",
  },
  EVENT_STORAGE_LIMIT_REACHED: {
    status: HttpStatus.FORBIDDEN,
    message: "Event storage limit reached",
  },
} as const satisfies Record<string, ApiErrorDefinition>;
