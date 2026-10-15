import { renderWithI18n } from "@/testing/render";
import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import WelcomeScreen from "./welcome-screen";

const initialMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};
const SafeArea = ({ children }: { children: ReactNode }) => (
  <SafeAreaProvider initialMetrics={initialMetrics}>{children}</SafeAreaProvider>
);
const renderWelcome = () => renderWithI18n(<WelcomeScreen />, { wrapper: SafeArea });

const mockLogin = jest.fn();
const mockSignup = jest.fn();
const mockAlert = jest.fn();

jest.mock("@/context/auth-context", () => ({
  useAuth: () => ({ login: mockLogin, signup: mockSignup, isLoading: false }),
}));

let mockParams: { signedOut?: string } = {};
jest.mock("expo-router", () => ({ useLocalSearchParams: () => mockParams }));

jest.mock("react-native/Libraries/Alert/Alert", () => ({
  __esModule: true,
  default: { alert: (...args: unknown[]) => mockAlert(...args) },
}));

beforeEach(() => {
  mockParams = {};
  mockLogin.mockReset().mockResolvedValue(undefined);
  mockSignup.mockReset().mockResolvedValue(undefined);
});

test("pitches the app and starts a roll through sign-up", async () => {
  await renderWelcome();
  expect(screen.getByRole("header", { name: "Everyone’s photos.\nOne roll for the night." })).toBeOnTheScreen();
  fireEvent.press(screen.getByRole("button", { name: "Start a roll" }));
  await waitFor(() => expect(mockSignup).toHaveBeenCalledTimes(1));
  expect(mockLogin).not.toHaveBeenCalled();
});

test("Sign in opens the sign-in step", async () => {
  await renderWelcome();
  fireEvent.press(screen.getByRole("button", { name: "Sign in" }));
  await waitFor(() => expect(mockLogin).toHaveBeenCalledTimes(1));
});

test("a failed sign-in says so", async () => {
  mockLogin.mockRejectedValue(new Error("Authentication failed. Please try again."));
  await renderWelcome();
  fireEvent.press(screen.getByRole("button", { name: "Sign in" }));
  await waitFor(() =>
    expect(mockAlert).toHaveBeenCalledWith("Couldn’t sign in", "Authentication failed. Please try again."),
  );
});

test("the contact sheet is decorative", async () => {
  await renderWelcome();
  expect(screen.queryByText("Every photo from the night, one roll")).not.toBeOnTheScreen();
});

test("after a 401 the welcome opens with the signed-out slip", async () => {
  mockParams = { signedOut: "1" };
  await renderWelcome();
  expect(screen.getByRole("header", { name: "Sign in again\nto see your rolls." })).toBeOnTheScreen();
  fireEvent.press(screen.getAllByRole("button", { name: "Sign in" }).at(-1)!);
  await waitFor(() => expect(mockLogin).toHaveBeenCalledTimes(1));
});

test("a normal visit has no slip", async () => {
  await renderWelcome();
  expect(screen.queryByText("Sign in again\nto see your rolls.")).not.toBeOnTheScreen();
});
