// The real auth context, so the test sees what a dead session after a
// password change leaves behind on the phone.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "@/context/auth-context";
import { onAccountCleared } from "@/lib/account-cleared";
import { I18nProvider } from "@/providers/i18n-provider";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useChangePassword } from "./use-change-password";

const mockReplace = jest.fn();
const mockGetUserProfile = jest.fn();
const mockClearLocalCredentials = jest.fn();
const mockSessionStillValid = jest.fn();
const mockLogoutFromAuth0 = jest.fn();

jest.mock("expo-router", () => ({
  router: { replace: (href: unknown) => mockReplace(href) },
  usePathname: () => "/account-settings",
}));
jest.mock("@/lib/auth", () => ({ authService: { getUserProfile: () => mockGetUserProfile() } }));
jest.mock("@/lib/api/axios-instance", () => ({
  setUnauthorizedHandler: jest.fn(),
  setSuspendedHandler: jest.fn(),
}));
jest.mock("@/lib/auth0", () => ({
  isAuth0Configured: () => true,
  hasValidSession: async () => true,
  getSignedInIdentity: async () => ({ sub: "auth0|ada", email: "ada@example.com", name: "Ada" }),
  clearLocalCredentials: () => mockClearLocalCredentials(),
  isUserCancellation: () => false,
  loginWithUniversalLogin: jest.fn(),
  logoutFromAuth0: () => mockLogoutFromAuth0(),
  openPasswordChangeTicket: async () => ({ type: "success" }),
  sessionStillValid: () => mockSessionStillValid(),
}));
jest.mock("../api/mutations", () => ({
  useCreatePasswordChangeTicketMutation: () => ({
    mutateAsync: async () => ({ ticketUrl: "https://auth0.example/ticket" }),
    isPending: false,
  }),
}));

const initialMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};
let queryClient: QueryClient;

const renderSignedIn = async () => {
  const rendered = await renderHook(() => ({ auth: useAuth(), password: useChangePassword() }), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <I18nProvider>
        <SafeAreaProvider initialMetrics={initialMetrics}>
          <QueryClientProvider client={queryClient}>
            <AuthProvider>{children}</AuthProvider>
          </QueryClientProvider>
        </SafeAreaProvider>
      </I18nProvider>
    ),
  });
  await waitFor(() => expect(rendered.result.current.auth.isAuthenticated).toBe(true));
  return rendered;
};

beforeEach(() => {
  jest.clearAllMocks();
  queryClient = new QueryClient();
  mockGetUserProfile.mockResolvedValue({ id: "u1", isOnboarded: true });
  mockClearLocalCredentials.mockResolvedValue(undefined);
  mockLogoutFromAuth0.mockResolvedValue(undefined);
  mockSessionStillValid.mockResolvedValue(true);
});

test("a password change that revokes the session clears the account like a 401", async () => {
  const reasons: string[] = [];
  const stop = onAccountCleared((reason) => reasons.push(reason));
  try {
    const { result } = await renderSignedIn();
    queryClient.setQueryData(["events"], [{ id: "roll-1" }]);
    mockSessionStillValid.mockResolvedValue(false);

    await act(async () => result.current.password.handleChangePassword());

    expect(mockClearLocalCredentials).toHaveBeenCalledTimes(1);
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
    expect(result.current.auth.user).toBeNull();
    expect(result.current.auth.identity).toBeNull();
    expect(reasons).toEqual(["sessionExpired"]);
    expect(mockReplace).toHaveBeenLastCalledWith({ pathname: "/login", params: { signedOut: "1" } });
    expect(mockLogoutFromAuth0).not.toHaveBeenCalled();
  } finally {
    stop();
  }
});

test("a password change that keeps the session leaves the account signed in", async () => {
  const { result } = await renderSignedIn();
  queryClient.setQueryData(["events"], [{ id: "roll-1" }]);

  await act(async () => result.current.password.handleChangePassword());

  expect(mockClearLocalCredentials).not.toHaveBeenCalled();
  expect(queryClient.getQueryData(["events"])).toEqual([{ id: "roll-1" }]);
  expect(result.current.auth.isAuthenticated).toBe(true);
  expect(mockReplace).not.toHaveBeenCalled();
});
