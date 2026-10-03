import { HttpStatus } from "@nestjs/common";
import type { ApiErrorDefinition } from "src/common/errors/api-error.types";
import {
  DETAILS_ALREADY_EXIST_CODE,
  ONBOARDING_INCOMPLETE_CODE,
  USERNAME_CHANGE_LIMIT,
  USERNAME_CHANGE_LIMITED_CODE,
  USERNAME_CHANGE_WINDOW_DAYS,
  USERNAME_RESERVED_CODE,
  USERNAME_TAKEN_CODE,
} from "./users.constants";

export const USER_API_ERRORS = {
  [DETAILS_ALREADY_EXIST_CODE]: {
    status: HttpStatus.CONFLICT,
    message: "User has already completed onboarding",
  },
  [ONBOARDING_INCOMPLETE_CODE]: {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    message: "Onboarding is incomplete",
  },
  [USERNAME_CHANGE_LIMITED_CODE]: {
    status: HttpStatus.TOO_MANY_REQUESTS,
    message: ({ availableAt }: { availableAt: Date }) =>
      `Username change limit reached (${USERNAME_CHANGE_LIMIT} per ${USERNAME_CHANGE_WINDOW_DAYS} days); available after ${availableAt.toISOString()}`,
  },
  [USERNAME_RESERVED_CODE]: {
    status: HttpStatus.BAD_REQUEST,
    message: ({ username }: { username: string }) => `Username "${username}" is reserved`,
  },
  [USERNAME_TAKEN_CODE]: {
    status: HttpStatus.CONFLICT,
    message: ({ username }: { username: string }) => `Username "${username}" is taken`,
  },
} as const satisfies Record<string, ApiErrorDefinition>;
