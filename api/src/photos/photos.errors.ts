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
  // Refused at confirm: the bytes are those of an intimate image the platform
  // removed (docs/moderation.md §7). Says nothing more, on purpose.
  PHOTO_REJECTED_MATCHES_REMOVED_IMAGE: {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    message: "The upload matches an image that was removed and can't be added",
  },
} as const satisfies Record<string, ApiErrorDefinition>;
