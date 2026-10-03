import {
  API_ERROR_CODES,
  API_ERROR_DOMAINS,
  API_ERROR_REGISTRY,
  resolveApiErrorMessage,
  type ApiErrorCode,
} from "./api-error-codes";
import { ApiException } from "./api.exception";

describe("API_ERROR_CODES", () => {
  it("lists unique values in alphabetical order matching the merged registry", () => {
    const fromRegistry = Object.keys(API_ERROR_REGISTRY).sort();
    expect([...API_ERROR_CODES]).toEqual(fromRegistry);
    expect(API_ERROR_CODES).toEqual([...new Set(API_ERROR_CODES)]);
  });

  it("merges domains without duplicate keys", () => {
    expect(Object.keys(API_ERROR_REGISTRY)).toHaveLength(
      API_ERROR_DOMAINS.reduce((n, domain) => n + Object.keys(domain).length, 0),
    );
  });

  describe("params", () => {
    it("builds a message from its params", () => {
      expect(resolveApiErrorMessage("ACTIVE_EVENT_LIMIT_REACHED", { limit: 2 })).toBe("Active event limit reached (2)");
      expect(new ApiException("ACTIVE_EVENT_LIMIT_REACHED", { limit: 2 }).message).toBe(
        "Active event limit reached (2)",
      );
    });

    // Without its params a message function throws a TypeError. The expected
    // type errors below are the guard: `pnpm run typecheck` fails if any of
    // these calls ever compiles again.
    it("doesn't compile without a code's params, even through the ApiErrorCode union", () => {
      const anyCode = "ACTIVE_EVENT_LIMIT_REACHED" as ApiErrorCode;

      // @ts-expect-error ACTIVE_EVENT_LIMIT_REACHED takes { limit }
      expect(() => new ApiException("ACTIVE_EVENT_LIMIT_REACHED")).toThrow(TypeError);
      // @ts-expect-error a code typed as the union needs the params any of its codes takes
      expect(() => resolveApiErrorMessage(anyCode)).toThrow(TypeError);
      // @ts-expect-error the same holds for an ApiException built from the union
      expect(() => new ApiException(anyCode)).toThrow(TypeError);
    });
  });
});
