import { HttpStatus } from "@nestjs/common";
import type { ApiErrorDefinition } from "src/common/errors/api-error.types";
import { STORAGE_RESERVATION_CONFLICT_CODE } from "./photos.constants";

export const PHOTO_API_ERRORS = {
  [STORAGE_RESERVATION_CONFLICT_CODE]: {
    status: HttpStatus.CONFLICT,
    message: "Storage reservation conflicted with a concurrent upload",
  },
} as const satisfies Record<string, ApiErrorDefinition>;
