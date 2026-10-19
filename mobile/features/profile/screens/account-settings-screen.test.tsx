import { renderWithI18n } from "@/testing/render";
import { screen, userEvent } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import AccountSettingsScreen from "./account-settings-screen";

const mockScreen = {
  user: { id: "user-1" } as object | null,
  card: {
    title: "Lab card · since Oct 2026",
    fields: [{ label: "Name", value: "Ada Lovelace" }],
    accessibilityLabel: "Your lab card: Ada Lovelace, @ada",
  },
  username: "@ada",
  email: "ada@example.com" as string | undefined,
  blockedCount: 2 as number | undefined,
  isLoading: false,
  isDeleting: false,
  isChangingPassword: false,
  signOutVisible: false,
  onBack: jest.fn(),
  onEditCard: jest.fn(),
  onOpenUsername: jest.fn(),
  onOpenPassword: jest.fn(),
  onOpenBlocked: jest.fn(),
  onOpenTerms: jest.fn(),
  onOpenPrivacy: jest.fn(),
  onSignOut: jest.fn(),
  onCloseSignOut: jest.fn(),
  onConfirmSignOut: jest.fn(),
  onDeleteAccount: jest.fn(),
};

jest.mock("../hooks/use-profile-screen", () => ({ useProfileScreen: () => mockScreen }));

const initialMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const renderScreen = () =>
  renderWithI18n(<AccountSettingsScreen />, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <SafeAreaProvider initialMetrics={initialMetrics}>{children}</SafeAreaProvider>
    ),
  });

beforeEach(() => {
  jest.clearAllMocks();
  mockScreen.user = { id: "user-1" };
  mockScreen.isDeleting = false;
  mockScreen.isChangingPassword = false;
  mockScreen.signOutVisible = false;
});

test("shows the lab card and the index", async () => {
  await renderScreen();
  expect(screen.getByRole("header", { name: "You" })).toBeOnTheScreen();
  expect(screen.getByLabelText("Your lab card: Ada Lovelace, @ada")).toBeOnTheScreen();
  expect(screen.getByLabelText("Email, ada@example.com")).toBeOnTheScreen();
  // The email has no endpoint to change it yet (EV-155), so it is not a button.
  expect(screen.queryByRole("button", { name: /^Email/ })).not.toBeOnTheScreen();
});

test.each([
  ["Edit", "onEditCard" as const],
  ["Username, @ada", "onOpenUsername" as const],
  ["Password", "onOpenPassword" as const],
  ["Blocked people, 2", "onOpenBlocked" as const],
  ["Terms of use", "onOpenTerms" as const],
  ["Privacy", "onOpenPrivacy" as const],
  ["Sign out", "onSignOut" as const],
  ["Delete account", "onDeleteAccount" as const],
  ["Back", "onBack" as const],
])("%s calls %s", async (name, handler) => {
  await renderScreen();
  await userEvent.setup().press(screen.getByRole("button", { name }));
  expect(mockScreen[handler]).toHaveBeenCalledTimes(1);
});

test("the index waits while the account is being deleted", async () => {
  mockScreen.isDeleting = true;
  await renderScreen();
  expect(screen.getByRole("button", { name: "Delete account, Deleting…" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Sign out" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Edit" })).toBeDisabled();
});

test("Password waits while Auth0's page opens", async () => {
  mockScreen.isChangingPassword = true;
  await renderScreen();
  expect(screen.getByRole("button", { name: "Password, Opening…" })).toBeDisabled();
});

test("the sign-out slip names the account and says nothing is lost", async () => {
  mockScreen.signOutVisible = true;
  await renderScreen();
  expect(screen.getByRole("header", { name: "Sign out?" })).toBeOnTheScreen();
  expect(screen.getByText("Your rolls and photos stay. Sign in again any time.")).toBeOnTheScreen();
  const user = userEvent.setup();
  // The index row is under the slip; the slip's leader is the last "Sign out".
  const leaders = screen.getAllByRole("button", { name: "Sign out" });
  await user.press(leaders[leaders.length - 1]);
  expect(mockScreen.onConfirmSignOut).toHaveBeenCalledTimes(1);
  await user.press(screen.getByRole("button", { name: "Cancel" }));
  expect(mockScreen.onCloseSignOut).toHaveBeenCalledTimes(1);
});
