import { OpenAPIObject, getSchemaPath } from "@nestjs/swagger";
import { ResponseMetaDto } from "src/common/swagger/response-meta.dto";
import { API_ERROR_CODES } from "./api-error-codes";

/** Published name of the shared error envelope. Generated clients use this type. */
export const API_ERROR_SCHEMA_NAME = "ApiErrorDto";

export const API_ERROR_SCHEMA_REF = `#/components/schemas/${API_ERROR_SCHEMA_NAME}`;

/**
 * Registers the HTTP error envelope (`message?`, `code?`, `meta`) as its own
 * schema. `AllExceptionsFilter` writes this shape at runtime; this is the
 * contract. Rate-limit documentation references it for 429 and does not own
 * the fields or the `code` enum.
 *
 * `ResponseMetaDto` is already a registered schema: every `@ApiWrappedResponse`
 * adds it.
 */
export const documentApiError = (document: OpenAPIObject): OpenAPIObject => {
  document.components ??= {};
  document.components.schemas = {
    ...document.components.schemas,
    [API_ERROR_SCHEMA_NAME]: {
      type: "object",
      required: ["meta"],
      properties: {
        message: { type: "string" },
        code: {
          type: "string",
          description: "Stable machine-readable error code, when the error has one",
          enum: [...API_ERROR_CODES],
        },
        meta: { $ref: getSchemaPath(ResponseMetaDto) },
      },
    },
  };

  return document;
};
