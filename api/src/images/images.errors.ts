import { HttpStatus } from "@nestjs/common";
import type { ApiErrorDefinition, ApiErrorParams } from "src/common/errors/api-error.types";
import { IMAGE_UPLOAD_ERROR_CODES, MAX_IMAGE_SIZE_BYTES } from "./images.constants";

export const IMAGE_API_ERRORS = {
  [IMAGE_UPLOAD_ERROR_CODES.INVALID_SIZE]: {
    status: HttpStatus.BAD_REQUEST,
    message: ({ sizeBytes }: ApiErrorParams) =>
      `Image size out of range (1–${MAX_IMAGE_SIZE_BYTES} bytes); received ${String(sizeBytes)}`,
  },
  [IMAGE_UPLOAD_ERROR_CODES.UNSUPPORTED_CONTENT_TYPE]: {
    status: HttpStatus.BAD_REQUEST,
    message: ({ contentType }: ApiErrorParams) => `Unsupported image content type "${String(contentType)}"`,
  },
  [IMAGE_UPLOAD_ERROR_CODES.UPLOAD_EXPIRED]: {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    message: ({ uploadId }: ApiErrorParams) => `Image upload "${String(uploadId)}" expired before confirmation`,
  },
  [IMAGE_UPLOAD_ERROR_CODES.UPLOAD_NOT_FOUND]: {
    status: HttpStatus.NOT_FOUND,
    message: ({ uploadId }: ApiErrorParams) => `No uploaded image found for upload "${String(uploadId)}"`,
  },
  [IMAGE_UPLOAD_ERROR_CODES.UPLOAD_REJECTED]: {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    message: ({ uploadId }: ApiErrorParams) =>
      `Uploaded image for upload "${String(uploadId)}" rejected (unsupported type or size)`,
  },
} as const satisfies Record<string, ApiErrorDefinition>;
