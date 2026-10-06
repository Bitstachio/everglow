import { API_ERROR_MESSAGE_DOMAINS, API_ERROR_MESSAGES, messageForApiErrorCode } from "./error-messages";

describe("API_ERROR_MESSAGES", () => {
  it("merges domains without duplicate keys", () => {
    expect(Object.keys(API_ERROR_MESSAGES)).toHaveLength(
      API_ERROR_MESSAGE_DOMAINS.reduce((n, domain) => n + Object.keys(domain).length, 0),
    );
  });
});

describe("messageForApiErrorCode", () => {
  it("ignores names that are not catalog codes", () => {
    expect(messageForApiErrorCode("toString")).toBeUndefined();
    expect(messageForApiErrorCode("constructor")).toBeUndefined();
    expect(messageForApiErrorCode(undefined)).toBeUndefined();
  });
});
