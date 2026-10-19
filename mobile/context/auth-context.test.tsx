import { toApiError } from "@/lib/api/errors";
import { renderWithI18n } from "@/testing/render";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { Pressable, Text } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider, useAuth } from "./auth-context";

const mockReplace = jest.fn();
const mockGetUserProfile = jest.fn();
let mockUnauthorized: (() => void) | null = null;

jest.mock("expo-router", () => ({
  router: { replace: (href: unknown) => mockReplace(href) },
  usePathname: () => "/events",
}));
jest.mock("@/lib/auth", () => ({ authService: { getUserProfile: () => mockGetUserProfile() } }));
jest.mock("@/lib/api/axios-instance", () => ({
  setUnauthorizedHandler: (handler: (() => void) | null) => {
    mockUnauthorized = handler;
  },
}));
jest.mock("@/lib/auth0", () => ({
  isAuth0Configured: () => true,
  hasValidSession: async () => true,
  clearLocalCredentials: async () => undefined,
  isUserCancellation: () => false,
  loginWithUniversalLogin: async () => undefined,
  logoutFromAuth0: async () => undefined,
}));

const initialMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};
let queryClient: QueryClient;
const Providers = ({ children }: { children: ReactNode }) => (
  <SafeAreaProvider initialMetrics={initialMetrics}>
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  </SafeAreaProvider>
);
const SignOut = () => {
  const { logout } = useAuth();
  return (
    <Pressable accessibilityRole="button" onPress={() => void logout()}>
      <Text>Sign out</Text>
    </Pressable>
  );
};
const renderProvider = () =>
  renderWithI18n(
    <AuthProvider>
      <Text>App</Text>
      <SignOut />
    </AuthProvider>,
    { wrapper: Providers },
  );

const offline = () => toApiError({ request: {}, message: "Network Error" });
const profile = { id: "u1", isOnboarded: true };

beforeEach(() => {
  queryClient = new QueryClient();
  mockReplace.mockReset();
  mockGetUserProfile.mockReset();
  mockUnauthorized = null;
});

test("opening the app offline keeps the session and offers to try again", async () => {
  mockGetUserProfile.mockRejectedValueOnce(offline()).mockResolvedValueOnce(profile);
  await renderProvider();

  expect(await screen.findByRole("header", { name: "The lab is out\nof reach." })).toBeOnTheScreen();
  expect(screen.getByText("App")).toBeOnTheScreen();

  fireEvent.press(screen.getByRole("button", { name: "Try again" }));
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/events"));
  expect(screen.queryByText("The lab is out")).not.toBeOnTheScreen();
});

test("a retry that is still offline stays on can't connect", async () => {
  mockGetUserProfile.mockRejectedValue(offline());
  await renderProvider();
  fireEvent.press(await screen.findByRole("button", { name: "Try again" }));
  await waitFor(() => expect(mockGetUserProfile).toHaveBeenCalledTimes(2));
  expect(screen.getByRole("header", { name: "The lab is out\nof reach." })).toBeOnTheScreen();
  expect(mockReplace).not.toHaveBeenCalled();
});

test("an answer from the API that isn't a connection failure goes to the welcome", async () => {
  mockGetUserProfile.mockRejectedValue(toApiError({ response: { status: 500 } }));
  jest.spyOn(console, "error").mockImplementation(() => undefined);
  await renderProvider();
  expect(await screen.findByText("App")).toBeOnTheScreen();
  expect(screen.queryByText("Try again")).not.toBeOnTheScreen();
});

test("a 401 sends the person to the welcome with the signed-out slip", async () => {
  mockGetUserProfile.mockResolvedValue(profile);
  await renderProvider();
  await screen.findByText("App");
  await act(async () => mockUnauthorized?.());
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith({ pathname: "/login", params: { signedOut: "1" } }));
});

test("signing out drops everything cached for the account", async () => {
  mockGetUserProfile.mockResolvedValue(profile);
  await renderProvider();
  await screen.findByText("App");
  queryClient.setQueryData(["blocks"], [{ userId: "u2" }]);

  fireEvent.press(screen.getByRole("button", { name: "Sign out" }));
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/login"));
  expect(queryClient.getQueryData(["blocks"])).toBeUndefined();
});

test("a 401 drops everything cached for the account", async () => {
  mockGetUserProfile.mockResolvedValue(profile);
  await renderProvider();
  await screen.findByText("App");
  queryClient.setQueryData(["blocks"], [{ userId: "u2" }]);

  await act(async () => mockUnauthorized?.());
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith({ pathname: "/login", params: { signedOut: "1" } }));
  expect(queryClient.getQueryData(["blocks"])).toBeUndefined();
});
