import { createApiError } from "@/lib/api/errors";
import { renderWithI18n } from "@/testing/render";
import { screen, userEvent, waitFor } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import type { UsernameAvailabilityState } from "../lib/username";
import { OnboardingDraftProvider } from "../onboarding-draft";
import OnboardingUsernameScreen from "./onboarding-username-screen";

const mockPush = jest.fn();
const mockBack = jest.fn();
jest.mock("expo-router", () => ({
  router: { push: (href: unknown) => mockPush(href), back: () => mockBack() },
}));

// Pencil marks render already drawn, so no animation runs outside act().
jest.mock("@/hooks/use-reduce-motion", () => ({ useReduceMotion: () => true }));

jest.mock("react-native-auth0", () => ({ useAuth0: () => ({ user: {} }) }));

const mockCompleteOnboarding = jest.fn();
jest.mock("@/context/auth-context", () => ({
  useAuth: () => ({ completeOnboarding: mockCompleteOnboarding, isLoading: false }),
}));

const mockAlert = jest.fn();
jest.mock("react-native/Libraries/Alert/Alert", () => ({
  __esModule: true,
  default: { alert: (...args: unknown[]) => mockAlert(...args) },
}));

const mockAvailability = jest.fn();
jest.mock("../hooks/use-username-availability", () => ({
  useUsernameAvailability: (...args: unknown[]) => mockAvailability(...args),
}));

const state = (overrides: Partial<UsernameAvailabilityState>): UsernameAvailabilityState => ({
  status: "idle",
  username: "",
  reason: null,
  message: null,
  canSubmit: false,
  suggestions: [],
  ...overrides,
});

const initialMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};
const renderStep = (username = "") =>
  renderWithI18n(<OnboardingUsernameScreen />, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <SafeAreaProvider initialMetrics={initialMetrics}>
        <OnboardingDraftProvider initial={{ name: "Maya Chen", username }}>{children}</OnboardingDraftProvider>
      </SafeAreaProvider>
    ),
  });

beforeEach(() => {
  jest.clearAllMocks();
  mockCompleteOnboarding.mockResolvedValue(undefined);
  mockAvailability.mockReturnValue(state({}));
});

test("lowercases as you type and checks availability with the name", async () => {
  const user = userEvent.setup();
  await renderStep();

  await user.type(screen.getByLabelText("Username"), "Maya");

  expect(screen.getByLabelText("Username")).toHaveDisplayValue("maya");
  expect(mockAvailability).toHaveBeenLastCalledWith("maya", { name: "Maya Chen" });
  expect(screen.getByText("a–z · 0–9 · dots and underscores · 3 to 30")).toBeOnTheScreen();
});

test("writes out the rule before asking the server", async () => {
  await renderStep("maya chen!");
  expect(screen.getByText("No spaces or “!”")).toBeOnTheScreen();
  expect(screen.getByText("Use a–z, 0–9, dots and underscores, 3 to 30")).toBeOnTheScreen();
});

test("says Checking… while the check runs", async () => {
  mockAvailability.mockReturnValue(state({ status: "checking", username: "maya" }));
  await renderStep("maya");
  expect(screen.getByText("Checking…")).toBeOnTheScreen();
});

test("offers free names when it's taken, and tapping one fills it in", async () => {
  const user = userEvent.setup();
  mockAvailability.mockReturnValue(
    state({ status: "unavailable", username: "maya", reason: "TAKEN", suggestions: ["maya.chen", "mayachen"] }),
  );
  await renderStep("maya");

  expect(screen.getByText("Taken")).toBeOnTheScreen();
  expect(screen.getByText("Someone has @maya. These are free:")).toBeOnTheScreen();
  await user.press(screen.getByRole("button", { name: "Use @maya.chen" }));
  expect(screen.getByLabelText("Username")).toHaveDisplayValue("maya.chen");
});

test("Continue waits for an available name and the terms, then completes onboarding", async () => {
  const user = userEvent.setup();
  mockAvailability.mockReturnValue(state({ status: "available", username: "maya.chen", canSubmit: true }));
  await renderStep("maya.chen");

  expect(screen.getByText("Available")).toBeOnTheScreen();
  expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
  await user.press(screen.getByRole("checkbox", { name: "I agree to the terms and the privacy policy" }));
  await user.press(screen.getByRole("button", { name: "Continue" }));

  await waitFor(() =>
    expect(mockCompleteOnboarding).toHaveBeenCalledWith({
      name: "Maya Chen",
      username: "maya.chen",
      acceptedTerms: true,
    }),
  );
});

test("opens the terms and the privacy policy from the sentence", async () => {
  const user = userEvent.setup();
  mockAvailability.mockReturnValue(state({ status: "available", username: "maya.chen", canSubmit: true }));
  await renderStep("maya.chen");

  await user.press(screen.getByRole("link", { name: "terms" }));
  await user.press(screen.getByRole("link", { name: "privacy policy" }));
  expect(mockPush).toHaveBeenNthCalledWith(1, "/terms-of-use");
  expect(mockPush).toHaveBeenNthCalledWith(2, "/privacy-policy");
});

test("a name taken just before Continue says so", async () => {
  const user = userEvent.setup();
  mockAvailability.mockReturnValue(state({ status: "available", username: "maya.chen", canSubmit: true }));
  mockCompleteOnboarding.mockRejectedValue(createApiError("taken", { status: 409, code: "USERNAME_TAKEN" }));
  await renderStep("maya.chen");

  await user.press(screen.getByRole("checkbox", { name: "I agree to the terms and the privacy policy" }));
  await user.press(screen.getByRole("button", { name: "Continue" }));

  expect(await screen.findByText("Someone has @maya.chen. Try another.")).toBeOnTheScreen();
  expect(mockAlert).not.toHaveBeenCalled();
});

test("any other failure is said in an alert", async () => {
  const user = userEvent.setup();
  mockAvailability.mockReturnValue(state({ status: "available", username: "maya.chen", canSubmit: true }));
  mockCompleteOnboarding.mockRejectedValue(new Error("boom"));
  await renderStep("maya.chen");

  await user.press(screen.getByRole("checkbox", { name: "I agree to the terms and the privacy policy" }));
  await user.press(screen.getByRole("button", { name: "Continue" }));

  await waitFor(() => expect(mockAlert).toHaveBeenCalledWith("Couldn’t save your lab card", expect.any(String)));
});

test("back returns to the name", async () => {
  const user = userEvent.setup();
  await renderStep();
  await user.press(screen.getByRole("button", { name: "Back" }));
  expect(mockBack).toHaveBeenCalled();
});
