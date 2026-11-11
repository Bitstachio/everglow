import { AUTH0_CUSTOM_SCHEME, parseClientEnv } from "./env";

describe("parseClientEnv", () => {
  it("defaults the API URL and password-change result when unset", () => {
    expect(parseClientEnv({})).toEqual({
      EXPO_PUBLIC_API_URL: "http://localhost:3000",
      EXPO_PUBLIC_AUTH0_DOMAIN: "",
      EXPO_PUBLIC_AUTH0_CLIENT_ID: "",
      EXPO_PUBLIC_AUTH0_AUDIENCE: "",
      EXPO_PUBLIC_AUTH0_PASSWORD_CHANGE_RESULT_URL: `${AUTH0_CUSTOM_SCHEME}://password-change/result`,
    });
  });

  it("treats empty strings like unset for URL fields", () => {
    expect(
      parseClientEnv({
        EXPO_PUBLIC_API_URL: "",
        EXPO_PUBLIC_AUTH0_PASSWORD_CHANGE_RESULT_URL: "",
      }).EXPO_PUBLIC_API_URL,
    ).toBe("http://localhost:3000");
  });

  it("keeps provided Auth0 and API values", () => {
    expect(
      parseClientEnv({
        EXPO_PUBLIC_API_URL: "https://api.example.com",
        EXPO_PUBLIC_AUTH0_DOMAIN: "tenant.us.auth0.com",
        EXPO_PUBLIC_AUTH0_CLIENT_ID: "client-id",
        EXPO_PUBLIC_AUTH0_AUDIENCE: "https://api.example.com",
        EXPO_PUBLIC_AUTH0_PASSWORD_CHANGE_RESULT_URL: "everglowmobile://password-change/result",
      }),
    ).toEqual({
      EXPO_PUBLIC_API_URL: "https://api.example.com",
      EXPO_PUBLIC_AUTH0_DOMAIN: "tenant.us.auth0.com",
      EXPO_PUBLIC_AUTH0_CLIENT_ID: "client-id",
      EXPO_PUBLIC_AUTH0_AUDIENCE: "https://api.example.com",
      EXPO_PUBLIC_AUTH0_PASSWORD_CHANGE_RESULT_URL: "everglowmobile://password-change/result",
    });
  });

  it("rejects a malformed API URL", () => {
    expect(() => parseClientEnv({ EXPO_PUBLIC_API_URL: "not-a-url" })).toThrow(
      /Invalid mobile public env:.*EXPO_PUBLIC_API_URL/s,
    );
  });

  it("rejects a malformed password-change result URL", () => {
    expect(() => parseClientEnv({ EXPO_PUBLIC_AUTH0_PASSWORD_CHANGE_RESULT_URL: "not-a-url" })).toThrow(
      /Invalid mobile public env:.*EXPO_PUBLIC_AUTH0_PASSWORD_CHANGE_RESULT_URL/s,
    );
  });
});
