import { API_ERROR_CODES } from "./api-error-codes";

describe("API_ERROR_CODES", () => {
  it("lists unique values in alphabetical order", () => {
    const values = [...API_ERROR_CODES];
    expect(values).toEqual([...new Set(values)].sort((a, b) => a.localeCompare(b)));
  });
});
