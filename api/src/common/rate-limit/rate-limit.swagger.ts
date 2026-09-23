import { HttpStatus } from "@nestjs/common";
import { OpenAPIObject, getSchemaPath } from "@nestjs/swagger";
import { ResponseMetaDto } from "../swagger/response-meta.dto";
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
 * hand. Operations marked by `@SkipRateLimit()` are left alone, and their
 * marker is stripped so it never reaches the published spec. `ResponseMetaDto`
 * is already a registered schema: every `@ApiWrappedResponse` adds it.
 */
export function documentRateLimitResponses(document: OpenAPIObject): OpenAPIObject {
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
          // The API's general error envelope, with this response's values as
          // examples. Deliberately not narrowed to the one code: it is the only
          // error body in the spec, so generated clients type every operation's
          // error from it, and those errors carry other codes or none.
          schema: {
            type: "object",
            required: ["meta"],
            properties: {
              message: { type: "string", example: RATE_LIMIT_EXCEEDED_MESSAGE },
              code: {
                type: "string",
                description: "Stable machine-readable error code, when the error has one",
                example: RATE_LIMIT_EXCEEDED_CODE,
              },
              meta: { $ref: getSchemaPath(ResponseMetaDto) },
            },
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
}
