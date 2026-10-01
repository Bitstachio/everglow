import { HttpStatus } from "@nestjs/common";
import { OpenAPIObject } from "@nestjs/swagger";
import { API_ERROR_SCHEMA_REF } from "../errors/api-error.dto";
import {
  RATE_LIMIT_EXCEEDED_CODE,
  RATE_LIMIT_EXCEEDED_MESSAGE,
  RATE_LIMIT_EXEMPT_EXTENSION,
} from "./rate-limit.constants";

const RESPONSE_NAME = "TooManyRequests";
const HTTP_METHODS = ["get", "put", "post", "delete", "options", "head", "patch", "trace"] as const;

/**
 * Documents the 429 once, as a shared component, and references it from every
 * operation the global guard covers, so no controller has to declare it by
 * hand. The JSON body is the shared error envelope (`ApiErrorDto`); this file
 * owns only `Retry-After`, which operations get a 429, and the rate-limit
 * example. Operations marked by `@SkipRateLimit()` are left alone, and their
 * marker is stripped so it never reaches the published spec.
 */
export const documentRateLimitResponses = (document: OpenAPIObject): OpenAPIObject => {
  document.components ??= {};
  document.components.responses = {
    ...document.components.responses,
    [RESPONSE_NAME]: {
      description: "Rate limit exceeded; retry after the number of seconds in the Retry-After header",
      headers: {
        "Retry-After": {
          description: "Seconds to wait before retrying",
          schema: { type: "integer", minimum: 1 },
        },
      },
      content: {
        "application/json": {
          schema: { $ref: API_ERROR_SCHEMA_REF },
          // OAS 3.0 ignores keywords next to `$ref`, so the rate-limit sample
          // lives on the media type, not on the shared envelope.
          example: {
            message: RATE_LIMIT_EXCEEDED_MESSAGE,
            code: RATE_LIMIT_EXCEEDED_CODE,
            meta: { timestamp: "2026-06-03T12:00:00.000Z", path: "/api/v2/events/join" },
          },
        },
      },
    },
  };

  for (const pathItem of Object.values(document.paths)) {
    for (const method of HTTP_METHODS) {
      const operation = pathItem[method] as (Record<string, unknown> & { responses: object }) | undefined;
      if (!operation) continue;

      if (operation[RATE_LIMIT_EXEMPT_EXTENSION]) {
        delete operation[RATE_LIMIT_EXEMPT_EXTENSION];
        continue;
      }

      operation.responses = {
        ...operation.responses,
        [HttpStatus.TOO_MANY_REQUESTS]: { $ref: `#/components/responses/${RESPONSE_NAME}` },
      };
    }
  }

  return document;
};
