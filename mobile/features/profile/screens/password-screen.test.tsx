import { renderWithI18n } from "@/testing/render";
import { screen, userEvent } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import PasswordScreen from "./password-screen";

const mockBack = jest.fn();
jest.mock("expo-router", () => ({ router: { back: () => mockBack(), canGoBack: () => true, replace: jest.fn() } }));

let mockSub = "apple|001.abc";
jest.mock("react-native-auth0", () => ({ useAuth0: () => ({ user: { sub: mockSub } }) }));

const initialMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const renderScreen = () =>
  renderWithI18n(<PasswordScreen />, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <SafeAreaProvider initialMetrics={initialMetrics}>{children}</SafeAreaProvider>
    ),
  });

test("an Apple account has no Everglow password", async () => {
  mockSub = "apple|001.abc";
  await renderScreen();

  expect(screen.getByRole("header", { name: "You sign in\nwith Apple." })).toBeOnTheScreen();
  expect(screen.getByText(/Settings › Apple Account/)).toBeOnTheScreen();
  await userEvent.setup().press(screen.getByRole("button", { name: "Ok" }));
  expect(mockBack).toHaveBeenCalledTimes(1);
});

test("a Google account points to its own settings", async () => {
  mockSub = "google-oauth2|123";
  await renderScreen();

  expect(screen.getByRole("header", { name: "You sign in\nwith Google." })).toBeOnTheScreen();
  expect(screen.getByText(/Google Account/)).toBeOnTheScreen();
});
