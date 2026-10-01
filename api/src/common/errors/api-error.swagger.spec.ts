import { OpenAPIObject } from "@nestjs/swagger";
import { API_ERROR_CODES } from "./api-error-codes";
import { API_ERROR_SCHEMA_NAME, API_ERROR_SCHEMA_REF, documentApiError } from "./api-error.swagger";

const buildDocument = (): OpenAPIObject => ({
  openapi: "3.0.0",
  info: { title: "fixture", version: "1" },
  paths: {
    "/users/me": { get: { responses: { 200: { description: "User profile" } } } },
  },
  components: {
    schemas: {
      ResponseMetaDto: { type: "object" },
    },
  },
});

describe("documentApiError", () => {
  it("registers the shared error envelope, including the closed code enum", () => {
    const document = documentApiError(buildDocument());

    expect(document.components?.schemas?.[API_ERROR_SCHEMA_NAME]).toEqual({
      type: "object",
      required: ["meta"],
      properties: {
        message: { type: "string" },
        code: {
          type: "string",
          description: "Stable machine-readable error code, when the error has one",
          enum: [...API_ERROR_CODES],
        },
        meta: { $ref: "#/components/schemas/ResponseMetaDto" },
      },
    });
    expect(API_ERROR_SCHEMA_REF).toBe(`#/components/schemas/${API_ERROR_SCHEMA_NAME}`);
  });

  it("leaves existing schemas and operations alone", () => {
    const document = documentApiError(buildDocument());

    expect(document.components?.schemas?.ResponseMetaDto).toEqual({ type: "object" });
    expect(document.paths["/users/me"].get?.responses).toEqual({ 200: { description: "User profile" } });
  });
});
