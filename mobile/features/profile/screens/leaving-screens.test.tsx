import { renderWithI18n } from "@/testing/render";
import { screen, userEvent } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import AccountDeletedScreen from "./account-deleted-screen";
import AccountSuspendedScreen from "./account-suspended-screen";
import DeleteAccountScreen from "./delete-account-screen";

const mockReplace = jest.fn();
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  router: { replace: (href: unknown) => mockReplace(href), push: (href: unknown) => mockPush(href) },
}));
const mockLogout = jest.fn();
let mockAuthLoading = false;
jest.mock("@/context/auth-context", () => ({ useAuth: () => ({ logout: mockLogout, isLoading: mockAuthLoading }) }));
jest.mock("../hooks/use-lab-card", () => ({
  useLabCard: () => ({ card: { title: "Lab card", fields: [], accessibilityLabel: "Your lab card: Ada, @ada" } }),
}));

const mockDeleteScreen = {
  photos: null as "KEEP" | "DELETE" | null,
  rolls: [
    { id: "e1", title: "Nadia turns 30", fate: "stays" as const },
    { id: "e2", title: "Picnic, just me", fate: "deleted" as const },
  ],
  showRolls: true,
  rollsFailed: false,
  isDeleting: false,
  onChoosePhotos: jest.fn(),
  onRetryRolls: jest.fn(),
  onDelete: jest.fn(),
  onBack: jest.fn(),
};
jest.mock("../hooks/use-delete-account-screen", () => ({ useDeleteAccountScreen: () => mockDeleteScreen }));

const initialMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};
const renderScreen = (ui: React.ReactElement) =>
  renderWithI18n(ui, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <SafeAreaProvider initialMetrics={initialMetrics}>{children}</SafeAreaProvider>
    ),
  });

beforeEach(() => {
  jest.clearAllMocks();
  mockAuthLoading = false;
  mockDeleteScreen.photos = null;
  mockDeleteScreen.showRolls = true;
  mockDeleteScreen.rollsFailed = false;
  mockDeleteScreen.isDeleting = false;
});

describe("14.11 Delete account", () => {
  test("the danger leader waits for a photos choice", async () => {
    await renderScreen(<DeleteAccountScreen />);
    expect(screen.getByRole("header", { name: "Delete your\naccount?" })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Delete my account" })).toBeDisabled();
    expect(screen.getByText("Choose what happens to your frames first")).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole("radio", { name: /^Delete them/ }));
    expect(mockDeleteScreen.onChoosePhotos).toHaveBeenCalledWith("DELETE");
  });

  test("once chosen, it says it can't be undone and deletes", async () => {
    mockDeleteScreen.photos = "KEEP";
    await renderScreen(<DeleteAccountScreen />);
    expect(screen.getByRole("radio", { name: /^Leave them/ })).toBeChecked();
    expect(screen.getByText("Can’t be undone · sign-in is removed too")).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole("button", { name: "Delete my account" }));
    expect(mockDeleteScreen.onDelete).toHaveBeenCalledTimes(1);
  });

  test("says what happens to each roll you started", async () => {
    await renderScreen(<DeleteAccountScreen />);
    expect(screen.getByLabelText("Nadia turns 30, Stays with the people on it")).toBeOnTheScreen();
    expect(screen.getByLabelText("Picnic, just me, Deleted · no one else on it")).toBeOnTheScreen();
  });

  test("says when the rolls couldn't load, and tries again", async () => {
    mockDeleteScreen.rollsFailed = true;
    await renderScreen(<DeleteAccountScreen />);
    expect(screen.getByText("Couldn’t load your rolls.")).toBeOnTheScreen();
    expect(screen.queryByLabelText("Nadia turns 30, Stays with the people on it")).not.toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole("button", { name: "Try again" }));
    expect(mockDeleteScreen.onRetryRolls).toHaveBeenCalledTimes(1);
  });

  test("leaves the rolls section out when there's nothing in it", async () => {
    mockDeleteScreen.showRolls = false;
    await renderScreen(<DeleteAccountScreen />);
    expect(screen.queryByText("Rolls you started or are alone on")).not.toBeOnTheScreen();
  });

  test.each([true, false])("says what is kept after deletion (rolls shown: %s)", async (showRolls) => {
    mockDeleteScreen.showRolls = showRolls;
    await renderScreen(<DeleteAccountScreen />);
    expect(
      screen.getByText(
        "Reports about you or by you, and copies of reported photos, are kept for up to a year for safety and legal reasons, then removed.",
      ),
    ).toBeOnTheScreen();
  });

  test("the leader waits while the account is being deleted", async () => {
    mockDeleteScreen.photos = "DELETE";
    mockDeleteScreen.isDeleting = true;
    await renderScreen(<DeleteAccountScreen />);
    expect(screen.getByRole("button", { name: "Delete my account" })).toBeDisabled();
    expect(screen.getByRole("radio", { name: /^Leave them/ })).toBeDisabled();
  });
});

test("14.12 Deleted goes back to the start", async () => {
  await renderScreen(<AccountDeletedScreen />);
  expect(screen.getByRole("header", { name: "Your account\nis deleted." })).toBeOnTheScreen();
  await userEvent.setup().press(screen.getByRole("button", { name: "Back to the start" }));
  expect(mockReplace).toHaveBeenCalledWith("/login");
});

describe("14.13 Suspended account", () => {
  test("says the account is on hold without saying why", async () => {
    await renderScreen(<AccountSuspendedScreen />);
    expect(screen.getByText("Account suspended")).toBeOnTheScreen();
    expect(screen.getByRole("header", { name: "Your account is\non hold." })).toBeOnTheScreen();
    expect(screen.getByLabelText("Your lab card: Ada, @ada")).toBeOnTheScreen();
  });

  test("can still delete the account, or sign out", async () => {
    const user = userEvent.setup();
    await renderScreen(<AccountSuspendedScreen />);
    await user.press(screen.getByRole("button", { name: "Delete my account" }));
    expect(mockPush).toHaveBeenCalledWith("/delete-account");
    await user.press(screen.getByRole("button", { name: "Sign out" }));
    expect(mockLogout).toHaveBeenCalledTimes(1);
  });

  test("waits while signing out", async () => {
    mockAuthLoading = true;
    await renderScreen(<AccountSuspendedScreen />);
    expect(screen.getByRole("button", { name: "Sign out" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Delete my account" })).toBeDisabled();
  });
});
