import { AUTH0_CUSTOM_SCHEME, parseEnv } from "./env";

const validAuth0 = {
  EXPO_PUBLIC_AUTH0_DOMAIN: "tenant.us.auth0.com",
  EXPO_PUBLIC_AUTH0_CLIENT_ID: "client-id",
  EXPO_PUBLIC_AUTH0_AUDIENCE: "https://api.example.com",
} as const;

describe("parseEnv", () => {
  it("defaults the API URL and password-change result when unset", () => {
    expect(parseEnv({ ...validAuth0 })).toEqual({
      EXPO_PUBLIC_API_URL: "http://localhost:3000",
      ...validAuth0,
      EXPO_PUBLIC_AUTH0_PASSWORD_CHANGE_RESULT_URL: `${AUTH0_CUSTOM_SCHEME}://password-change/result`,
    });
  });

  it("treats empty strings like unset for URL fields that have defaults", () => {
    expect(
      parseEnv({
        ...validAuth0,
        EXPO_PUBLIC_API_URL: "",
        EXPO_PUBLIC_AUTH0_PASSWORD_CHANGE_RESULT_URL: "",
      }).EXPO_PUBLIC_API_URL,
    ).toBe("http://localhost:3000");
  });

  it("keeps provided Auth0 and API values", () => {
    expect(
      parseEnv({
        EXPO_PUBLIC_API_URL: "https://api.example.com",
        ...validAuth0,
        EXPO_PUBLIC_AUTH0_PASSWORD_CHANGE_RESULT_URL: "everglowmobile://password-change/result",
      }),
    ).toEqual({
      EXPO_PUBLIC_API_URL: "https://api.example.com",
      ...validAuth0,
      EXPO_PUBLIC_AUTH0_PASSWORD_CHANGE_RESULT_URL: "everglowmobile://password-change/result",
    });
  });

  it("rejects a malformed API URL", () => {
    expect(() => parseEnv({ ...validAuth0, EXPO_PUBLIC_API_URL: "not-a-url" })).toThrow(
      /Invalid mobile public env:.*EXPO_PUBLIC_API_URL/s,
    );
  });

  it("rejects a malformed password-change result URL", () => {
    expect(() => parseEnv({ ...validAuth0, EXPO_PUBLIC_AUTH0_PASSWORD_CHANGE_RESULT_URL: "not-a-url" })).toThrow(
      /Invalid mobile public env:.*EXPO_PUBLIC_AUTH0_PASSWORD_CHANGE_RESULT_URL/s,
    );
  });

  it("rejects missing Auth0 values", () => {
    expect(() => parseEnv({})).toThrow(/Invalid mobile public env:.*EXPO_PUBLIC_AUTH0_DOMAIN/s);
    expect(() => parseEnv({ ...validAuth0, EXPO_PUBLIC_AUTH0_DOMAIN: "" })).toThrow(
      /Invalid mobile public env:.*EXPO_PUBLIC_AUTH0_DOMAIN/s,
    );
    expect(() => parseEnv({ ...validAuth0, EXPO_PUBLIC_AUTH0_CLIENT_ID: "" })).toThrow(
      /Invalid mobile public env:.*EXPO_PUBLIC_AUTH0_CLIENT_ID/s,
    );
    expect(() => parseEnv({ ...validAuth0, EXPO_PUBLIC_AUTH0_AUDIENCE: "" })).toThrow(
      /Invalid mobile public env:.*EXPO_PUBLIC_AUTH0_AUDIENCE/s,
    );
  });
});
