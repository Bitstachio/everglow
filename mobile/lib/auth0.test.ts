import { logoutFromAuth0 } from "./auth0";

const mockSteps: string[] = [];
const mockGetCredentials = jest.fn();
const mockRevoke = jest.fn();
const mockClearSession = jest.fn();
const mockClearCredentials = jest.fn();

jest.mock("react-native-auth0", () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    auth: { revoke: (...args: unknown[]) => mockRevoke(...args) },
    webAuth: { clearSession: (...args: unknown[]) => mockClearSession(...args) },
    credentialsManager: {
      getCredentials: () => mockGetCredentials(),
      clearCredentials: () => mockClearCredentials(),
    },
  })),
  parseIdToken: jest.fn(),
}));
jest.mock("expo-web-browser", () => ({ openAuthSessionAsync: jest.fn() }));

const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);

beforeEach(() => {
  jest.clearAllMocks();
  mockSteps.length = 0;
  mockGetCredentials.mockResolvedValue({ accessToken: "access", idToken: "id", refreshToken: "refresh-1" });
  mockRevoke.mockImplementation(async () => void mockSteps.push("revoke"));
  mockClearSession.mockImplementation(async () => void mockSteps.push("clearSession"));
  mockClearCredentials.mockImplementation(async () => void mockSteps.push("clearCredentials"));
});

test("signing out revokes the refresh token at Auth0 before forgetting it on the phone", async () => {
  await logoutFromAuth0();

  expect(mockRevoke).toHaveBeenCalledWith({ refreshToken: "refresh-1" });
  expect(mockSteps).toEqual(["revoke", "clearSession", "clearCredentials"]);
  expect(warn).not.toHaveBeenCalled();
});

test("a revoke Auth0 refuses is logged, and the phone still signs out", async () => {
  mockRevoke.mockRejectedValue(Object.assign(new Error("Unauthorized"), { code: "invalid_grant" }));

  await expect(logoutFromAuth0()).resolves.toBeUndefined();

  expect(mockSteps).toEqual(["clearSession", "clearCredentials"]);
  expect(warn).toHaveBeenCalledWith("auth.sign_out.revoke_failed", { reason: "invalid_grant" });
  expect(JSON.stringify(warn.mock.calls)).not.toContain("refresh-1");
});

test("credentials that can't be read are logged, and the phone still signs out", async () => {
  mockGetCredentials.mockRejectedValue(Object.assign(new Error("No credentials"), { name: "CredentialsManagerError" }));

  await logoutFromAuth0();

  expect(mockRevoke).not.toHaveBeenCalled();
  expect(mockSteps).toEqual(["clearSession", "clearCredentials"]);
  expect(warn).toHaveBeenCalledWith("auth.sign_out.revoke_failed", { reason: "CredentialsManagerError" });
});

test("a session without a refresh token has nothing to revoke", async () => {
  mockGetCredentials.mockResolvedValue({ accessToken: "access", idToken: "id" });

  await logoutFromAuth0();

  expect(mockRevoke).not.toHaveBeenCalled();
  expect(mockSteps).toEqual(["clearSession", "clearCredentials"]);
  expect(warn).not.toHaveBeenCalled();
});
