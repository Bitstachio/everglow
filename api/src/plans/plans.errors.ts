import { HttpStatus } from "@nestjs/common";
import type { ApiErrorDefinition } from "src/common/errors/api-error.types";
import { PLAN_LIMIT_CODES } from "./plans.constants";

export const PLAN_API_ERRORS = {
  [PLAN_LIMIT_CODES.ACTIVE_EVENT_LIMIT_REACHED]: {
    status: HttpStatus.FORBIDDEN,
    message: ({ limit }: { limit: number }) => `Active event limit reached (${limit})`,
  },
  [PLAN_LIMIT_CODES.EVENT_GALLERY_CLOSED]: {
    status: HttpStatus.FORBIDDEN,
    message: "Event gallery is closed",
  },
  [PLAN_LIMIT_CODES.EVENT_GALLERY_NOT_OPEN]: {
    status: HttpStatus.FORBIDDEN,
    message: "Event gallery is not open",
  },
  [PLAN_LIMIT_CODES.EVENT_MEMBER_LIMIT_REACHED]: {
    status: HttpStatus.FORBIDDEN,
    message: ({ limit }: { limit: number }) => `Event member limit reached (${limit})`,
  },
  [PLAN_LIMIT_CODES.EVENT_SCHEDULE_LOCKED]: {
    status: HttpStatus.FORBIDDEN,
    message: "Event schedule is locked",
  },
  [PLAN_LIMIT_CODES.EVENT_STILL_ACTIVE]: {
    status: HttpStatus.FORBIDDEN,
    message: "Event is still active",
  },
  [PLAN_LIMIT_CODES.EVENT_STORAGE_LIMIT_REACHED]: {
    status: HttpStatus.FORBIDDEN,
    message: "Event storage limit reached",
  },
} as const satisfies Record<string, ApiErrorDefinition>;
