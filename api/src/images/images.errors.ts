import { HttpStatus } from "@nestjs/common";
import type { ApiErrorDefinition } from "src/common/errors/api-error.types";
import { IMAGE_UPLOAD_ERROR_CODES, MAX_IMAGE_SIZE_BYTES } from "./images.constants";

export const IMAGE_API_ERRORS = {
  [IMAGE_UPLOAD_ERROR_CODES.INVALID_SIZE]: {
    status: HttpStatus.BAD_REQUEST,
    message: ({ sizeBytes }: { sizeBytes: number }) =>
      `Image size out of range (1–${MAX_IMAGE_SIZE_BYTES} bytes); received ${sizeBytes}`,
  },
  [IMAGE_UPLOAD_ERROR_CODES.UNSUPPORTED_CONTENT_TYPE]: {
    status: HttpStatus.BAD_REQUEST,
    message: ({ contentType }: { contentType: string }) => `Unsupported image content type "${contentType}"`,
  },
  [IMAGE_UPLOAD_ERROR_CODES.UPLOAD_EXPIRED]: {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    message: ({ uploadId }: { uploadId: string }) => `Image upload "${uploadId}" expired before confirmation`,
  },
  [IMAGE_UPLOAD_ERROR_CODES.UPLOAD_NOT_FOUND]: {
    status: HttpStatus.NOT_FOUND,
    message: ({ uploadId }: { uploadId: string }) => `No uploaded image found for upload "${uploadId}"`,
  },
  [IMAGE_UPLOAD_ERROR_CODES.UPLOAD_REJECTED]: {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    message: ({ uploadId }: { uploadId: string }) =>
      `Uploaded image for upload "${uploadId}" rejected (unsupported type or size)`,
  },
} as const satisfies Record<string, ApiErrorDefinition>;
