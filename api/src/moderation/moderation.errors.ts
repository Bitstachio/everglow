import { HttpStatus } from "@nestjs/common";
import type { ApiErrorDefinition } from "src/common/errors/api-error.types";

/** Reports and blocks (docs/moderation.md). */
export const MODERATION_API_ERRORS = {
  CANNOT_BLOCK_SELF: {
    status: HttpStatus.FORBIDDEN,
    message: "Caller cannot block themselves",
  },
  CANNOT_REPORT_SELF: {
    status: HttpStatus.FORBIDDEN,
    message: "Caller cannot report themselves or their own photo",
  },
  CANNOT_RESOLVE_OWN_REPORT: {
    status: HttpStatus.FORBIDDEN,
    message: ({ reportId }: { reportId: string }) => `Report "${reportId}" is about the caller or their photo`,
  },
  REPORT_ALREADY_RESOLVED: {
    status: HttpStatus.CONFLICT,
    message: ({ reportId }: { reportId: string }) => `Report "${reportId}" was resolved by someone else first`,
  },
  REPORT_ESCALATED: {
    status: HttpStatus.FORBIDDEN,
    message: ({ reportId }: { reportId: string }) => `Report "${reportId}" is with the platform`,
  },
  EVIDENCE_NOT_AVAILABLE: {
    status: HttpStatus.NOT_FOUND,
    message: ({ reportId }: { reportId: string }) => `Report "${reportId}" has no reported object to show`,
  },
  PLATFORM_MODERATOR_ONLY: {
    status: HttpStatus.FORBIDDEN,
    message: "Only platform moderators may do this",
  },
  REPORT_CHANGED_CONCURRENTLY: {
    status: HttpStatus.CONFLICT,
    message: "The caller's open report on this target was resolved while a new one was being filed",
  },
  REPORTED_MEMBER_GONE: {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    message: ({ reportId }: { reportId: string }) => `The member reported in report "${reportId}" no longer exists`,
  },
  REPORTED_PHOTO_GONE: {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    message: ({ reportId }: { reportId: string }) => `The photo reported in report "${reportId}" no longer exists`,
  },
} as const satisfies Record<string, ApiErrorDefinition>;
