import { API_ERROR_MESSAGE_DOMAINS, API_ERROR_MESSAGES } from "./error-messages";

describe("API_ERROR_MESSAGES", () => {
  it("merges domains without duplicate keys", () => {
    expect(Object.keys(API_ERROR_MESSAGES)).toHaveLength(
      API_ERROR_MESSAGE_DOMAINS.reduce((n, domain) => n + Object.keys(domain).length, 0),
    );
  });
});
