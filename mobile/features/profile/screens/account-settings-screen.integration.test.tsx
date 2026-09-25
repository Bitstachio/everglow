// Integration tests compose the real screen with its data hooks.
// eslint-disable-next-line no-restricted-imports
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, userEvent, waitFor } from "@testing-library/react-native";
// Observe the native alert boundary without replacing screen hooks.
// eslint-disable-next-line no-restricted-imports
import { Alert } from "react-native";
import AccountSettingsScreen from "./account-settings-screen";

const mockCreateTicket = jest.fn();
const mockOpenTicket = jest.fn();
const mockSessionStillValid = jest.fn();
const mockClearLocalCredentials = jest.fn();
const mockReplace = jest.fn();
const mockPush = jest.fn();
let mockAuth0Sub: string | undefined = "auth0|user-1";
const mockUser = {
  id: "user-1",
  isOnboarded: true,
  details: { name: "Ada Lovelace", username: "ada.lovelace" },
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

jest.mock("@/lib/api/generated/client.gen", () => ({ client: { getConfig: () => ({}) } }));
jest.mock("@/lib/api/generated", () => ({
  usersControllerCreatePasswordChangeTicket: (...args: unknown[]) => mockCreateTicket(...args),
  usersControllerRemoveMe: jest.fn(),
  usersControllerUpdateMe: jest.fn(),
}));
jest.mock("react-native-auth0", () => ({
  useAuth0: () => ({ user: mockAuth0Sub ? { sub: mockAuth0Sub } : null }),
}));
jest.mock("@/context/auth-context", () => ({
  useAuth: () => ({
    user: mockUser,
    logout: jest.fn(),
    isLoading: false,
    updateUser: jest.fn(),
  }),
}));
jest.mock("@/lib/auth0", () => ({
  openPasswordChangeTicket: (...args: unknown[]) => mockOpenTicket(...args),
  sessionStillValid: (...args: unknown[]) => mockSessionStillValid(...args),
  clearLocalCredentials: (...args: unknown[]) => mockClearLocalCredentials(...args),
}));
jest.mock("@/lib/auth0-identity", () => ({
  isDatabaseIdentity: (sub: string | null | undefined) => typeof sub === "string" && sub.startsWith("auth0|"),
}));
jest.mock("expo-router", () => ({
  router: {
    push: (...args: unknown[]) => mockPush(...args),
    replace: (...args: unknown[]) => mockReplace(...args),
  },
}));

const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});

const renderScreen = async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <AccountSettingsScreen />
    </QueryClientProvider>,
  );
};

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth0Sub = "auth0|user-1";
  mockCreateTicket.mockResolvedValue({
    data: { data: { ticketUrl: "https://auth0.example/ticket" }, meta: {} },
  });
  mockOpenTicket.mockResolvedValue({ type: "success", url: "everglowmobile://password-change/result" });
  mockSessionStillValid.mockResolvedValue(true);
  mockClearLocalCredentials.mockResolvedValue(undefined);
});

test("Change Password mints a ticket and opens the Auth0 hosted page", async () => {
  await renderScreen();

  await userEvent.setup().press(screen.getByRole("button", { name: "Change Password" }));

  await waitFor(() => {
    expect(mockCreateTicket).toHaveBeenCalledWith(expect.objectContaining({ throwOnError: true }));
  });
  await waitFor(() => {
    expect(mockOpenTicket).toHaveBeenCalledWith("https://auth0.example/ticket");
  });
  expect(mockClearLocalCredentials).not.toHaveBeenCalled();
  expect(mockReplace).not.toHaveBeenCalled();
});

test("expired credentials after the change clear the session and route to login", async () => {
  mockSessionStillValid.mockResolvedValue(false);
  await renderScreen();

  await userEvent.setup().press(screen.getByRole("button", { name: "Change Password" }));

  await waitFor(() => {
    expect(mockClearLocalCredentials).toHaveBeenCalledTimes(1);
  });
  expect(mockReplace).toHaveBeenCalledWith("/login");
});

test("social identities do not see Change Password", async () => {
  mockAuth0Sub = "apple|001.abc";
  await renderScreen();

  expect(screen.queryByRole("button", { name: "Change Password" })).not.toBeOnTheScreen();
  expect(mockCreateTicket).not.toHaveBeenCalled();
});

test("ticket failures surface an alert without opening the browser", async () => {
  mockCreateTicket.mockRejectedValue(new Error("Auth0 unavailable"));
  await renderScreen();

  await userEvent.setup().press(screen.getByRole("button", { name: "Change Password" }));

  await waitFor(() => {
    expect(alert).toHaveBeenCalledWith("Could not change password", "Auth0 unavailable");
  });
  expect(mockOpenTicket).not.toHaveBeenCalled();
});
