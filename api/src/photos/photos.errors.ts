import { HttpStatus } from "@nestjs/common";
import type { ApiErrorDefinition } from "src/common/errors/api-error.types";

export const PHOTO_API_ERRORS = {
  VIEWER_CANNOT_UPLOAD: {
    status: HttpStatus.FORBIDDEN,
    message: "Caller is a viewer of the event, and viewers cannot add photos",
  },
  STORAGE_RESERVATION_CONFLICT: {
    status: HttpStatus.CONFLICT,
    message: "Storage reservation conflicted with a concurrent upload",
  },
} as const satisfies Record<string, ApiErrorDefinition>;
