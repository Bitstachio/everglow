import { HttpStatus } from "@nestjs/common";
import type { ApiErrorDefinition } from "src/common/errors/api-error.types";
import { USERNAME_CHANGE_LIMIT, USERNAME_CHANGE_WINDOW_DAYS } from "./users.constants";

export const USER_API_ERRORS = {
  AVATAR_CHANGED_CONCURRENTLY: {
    status: HttpStatus.CONFLICT,
    message: "Avatar was changed by another request",
  },
  DETAILS_ALREADY_EXIST: {
    status: HttpStatus.CONFLICT,
    message: "User has already completed onboarding",
  },
  ONBOARDING_INCOMPLETE: {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    message: "Onboarding is incomplete",
  },
  PASSWORD_CHANGE_NOT_AVAILABLE: {
    status: HttpStatus.FORBIDDEN,
    message: "Password changes are only available for database identities",
  },
  USERNAME_CHANGE_LIMITED: {
    status: HttpStatus.TOO_MANY_REQUESTS,
    message: ({ availableAt }: { availableAt: Date }) =>
      `Username change limit reached (${USERNAME_CHANGE_LIMIT} per ${USERNAME_CHANGE_WINDOW_DAYS} days); available after ${availableAt.toISOString()}`,
  },
  USERNAME_RESERVED: {
    status: HttpStatus.BAD_REQUEST,
    message: ({ username }: { username: string }) => `Username "${username}" is reserved`,
  },
  USERNAME_TAKEN: {
    status: HttpStatus.CONFLICT,
    message: ({ username }: { username: string }) => `Username "${username}" is taken`,
  },
} as const satisfies Record<string, ApiErrorDefinition>;
