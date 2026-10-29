import { renderWithI18n } from "@/testing/render";
import { screen, userEvent } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { OnboardingDraftProvider } from "../onboarding-draft";
import OnboardingNameScreen from "./onboarding-name-screen";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({ router: { push: (href: unknown) => mockPush(href) } }));

let mockIdentity: { name?: string } = {};
// Pencil marks render already drawn, so no animation runs outside act().
jest.mock("@/hooks/use-reduce-motion", () => ({ useReduceMotion: () => true }));

jest.mock("@/context/auth-context", () => ({ useAuth: () => ({ identity: mockIdentity }) }));

const initialMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};
const Providers = ({ children }: { children: ReactNode }) => (
  <SafeAreaProvider initialMetrics={initialMetrics}>
    <OnboardingDraftProvider>{children}</OnboardingDraftProvider>
  </SafeAreaProvider>
);
const renderStep = () => renderWithI18n(<OnboardingNameScreen />, { wrapper: Providers });

beforeEach(() => {
  mockPush.mockReset();
  mockIdentity = {};
});

test("starts empty, with the sample frame waiting for a name", async () => {
  await renderStep();
  expect(screen.getByText("Step 1 of 3")).toBeOnTheScreen();
  expect(screen.getByLabelText("Your name")).toHaveDisplayValue("");
  expect(screen.getByRole("image", { name: "A sample photo, signed Your name" })).toBeOnTheScreen();
  expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
});

test("prefills the name from the sign-in, but never an email", async () => {
  mockIdentity = { name: "Ada Lovelace" };
  await renderStep();
  expect(screen.getByLabelText("Your name")).toHaveDisplayValue("Ada Lovelace");
});

test("does not take an email address as the name", async () => {
  mockIdentity = { name: "ada@example.com" };
  await renderStep();
  expect(screen.getByLabelText("Your name")).toHaveDisplayValue("");
});

test("signs the sample frame as you type, then goes on to the username", async () => {
  const user = userEvent.setup();
  await renderStep();

  await user.type(screen.getByLabelText("Your name"), "Maya");

  expect(screen.getByRole("image", { name: "A sample photo, signed Maya" })).toBeOnTheScreen();
  expect(screen.getByText("how it shows\non your photos", { includeHiddenElements: true })).toBeOnTheScreen();
  await user.press(screen.getByRole("button", { name: "Next" }));
  expect(mockPush).toHaveBeenCalledWith("/onboarding/username");
});

test("needs two characters before Next", async () => {
  const user = userEvent.setup();
  await renderStep();
  await user.type(screen.getByLabelText("Your name"), " M ");
  expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
});
