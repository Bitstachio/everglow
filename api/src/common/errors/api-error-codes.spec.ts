import { API_ERROR_CODES, API_ERROR_REGISTRY } from "./api-error-codes";

describe("API_ERROR_CODES", () => {
  it("lists unique values in alphabetical order matching the definitions registry", () => {
    const fromDefinitions = Object.keys(API_ERROR_REGISTRY).sort((a, b) => a.localeCompare(b));
    expect([...API_ERROR_CODES]).toEqual(fromDefinitions);
    expect(API_ERROR_CODES).toEqual([...new Set(API_ERROR_CODES)]);
  });
});
