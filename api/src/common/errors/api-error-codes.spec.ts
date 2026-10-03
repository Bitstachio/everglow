import { API_ERROR_CODES, API_ERROR_REGISTRY, API_ERROR_SLICES } from "./api-error-codes";

describe("API_ERROR_CODES", () => {
  it("lists unique values in alphabetical order matching the merged registry", () => {
    const fromRegistry = Object.keys(API_ERROR_REGISTRY).sort((a, b) => a.localeCompare(b));
    expect([...API_ERROR_CODES]).toEqual(fromRegistry);
    expect(API_ERROR_CODES).toEqual([...new Set(API_ERROR_CODES)]);
  });

  it("merges domain slices without duplicate keys", () => {
    expect(Object.keys(API_ERROR_REGISTRY)).toHaveLength(
      API_ERROR_SLICES.reduce((n, slice) => n + Object.keys(slice).length, 0),
    );
  });
});
