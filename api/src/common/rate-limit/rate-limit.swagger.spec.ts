import { OpenAPIObject } from "@nestjs/swagger";
import { RATE_LIMIT_EXCEEDED_CODE, RATE_LIMIT_EXEMPT_EXTENSION } from "./rate-limit.constants";
import { documentRateLimitResponses } from "./rate-limit.swagger";

const TOO_MANY_REQUESTS_REF = { $ref: "#/components/responses/TooManyRequests" };

// Built per document: the documenter strips the marker in place.
const exemptOperation = () => ({ responses: { 200: { description: "" } }, [RATE_LIMIT_EXEMPT_EXTENSION]: true });

const buildDocument = (): OpenAPIObject => ({
  openapi: "3.0.0",
  info: { title: "fixture", version: "1" },
  paths: {
    "/": { get: exemptOperation() },
    "/events/join": { post: { responses: { 200: { description: "Joined event" } } } },
    "/users/me": {
      get: { responses: { 200: { description: "User profile" } } },
      delete: { responses: { 204: { description: "User deleted" } } },
    },
  },
});

describe("documentRateLimitResponses", () => {
  it("declares the 429 once as a shared component carrying the code and Retry-After", () => {
    const document = documentRateLimitResponses(buildDocument());

    expect(document.components?.responses?.TooManyRequests).toMatchObject({
      headers: { "Retry-After": { schema: { type: "integer" } } },
      content: {
        "application/json": {
          schema: { required: ["meta"], properties: { code: { example: RATE_LIMIT_EXCEEDED_CODE } } },
        },
      },
    });
  });

  it("references it from every operation, keeping the responses already documented", () => {
    const { paths } = documentRateLimitResponses(buildDocument());

    expect(paths["/events/join"].post?.responses).toEqual({
      200: { description: "Joined event" },
      429: TOO_MANY_REQUESTS_REF,
    });
    expect(paths["/users/me"].get?.responses[429]).toEqual(TOO_MANY_REQUESTS_REF);
    expect(paths["/users/me"].delete?.responses[429]).toEqual(TOO_MANY_REQUESTS_REF);
  });

  it("leaves an exempt operation without a 429 and strips its marker from the spec", () => {
    const { paths } = documentRateLimitResponses(buildDocument());

    expect(paths["/"].get?.responses).toEqual({ 200: { description: "" } });
    expect(paths["/"].get).not.toHaveProperty(RATE_LIMIT_EXEMPT_EXTENSION);
  });
});
