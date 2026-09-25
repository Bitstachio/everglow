import { render, screen, userEvent, waitFor } from "@testing-library/react-native";
import { Alert } from "react-native";
import { ApiError } from "@/lib/api/errors";
import OnboardingScreen from "./onboarding";

const mockCompleteOnboarding = jest.fn();
const mockClearError = jest.fn();
const mockReplace = jest.fn();

jest.mock("expo-router", () => ({
  router: { replace: (href: unknown) => mockReplace(href) },
}));

jest.mock("react-native-auth0", () => ({
  useAuth0: () => ({ user: { name: "Ada Lovelace", email: "ada@example.com" } }),
}));

jest.mock("@/hooks/use-color-scheme", () => ({
  useColorScheme: () => "light",
}));

jest.mock("@/context/auth-context", () => ({
  useAuth: () => ({
    completeOnboarding: mockCompleteOnboarding,
    isLoading: false,
    error: null,
    clearError: mockClearError,
    isAuthenticated: true,
    isOnboarded: false,
  }),
}));

const mockAvailability = jest.fn();
jest.mock("@/features/profile/hooks/use-username-availability", () => ({
  useUsernameAvailability: (...args: unknown[]) => mockAvailability(...args),
}));

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, "alert").mockImplementation(() => {});
  mockCompleteOnboarding.mockResolvedValue(undefined);
  mockAvailability.mockReturnValue({
    status: "available",
    username: "ada.lovelace",
    reason: null,
    message: "Username is available",
    canSubmit: true,
  });
});

test("prefills name from Auth0 and does not prefill email as username", async () => {
  await render(<OnboardingScreen />);

  expect(screen.getByDisplayValue("Ada Lovelace")).toBeOnTheScreen();
  expect(screen.getByLabelText("Username")).toHaveDisplayValue("");
  expect(screen.queryByLabelText("Email")).not.toBeOnTheScreen();
});

test("submits name and username without email", async () => {
  const user = userEvent.setup();
  await render(<OnboardingScreen />);

  await user.paste(screen.getByLabelText("Username"), "ada.lovelace");
  await user.press(screen.getByRole("button", { name: "Continue" }));

  await waitFor(() =>
    expect(mockCompleteOnboarding).toHaveBeenCalledWith({ name: "Ada Lovelace", username: "ada.lovelace" }),
  );
});

test("keeps Continue disabled until the username is available", async () => {
  mockAvailability.mockReturnValue({
    status: "unavailable",
    username: "taken",
    reason: "TAKEN",
    message: "This username is taken",
    canSubmit: false,
  });
  await render(<OnboardingScreen />);

  expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
  expect(mockCompleteOnboarding).not.toHaveBeenCalled();
});

test("shows taken when onboarding loses a uniqueness race", async () => {
  mockCompleteOnboarding.mockRejectedValueOnce(
    new ApiError("Username already exists", { status: 409, code: "USERNAME_TAKEN" }),
  );
  const user = userEvent.setup();
  await render(<OnboardingScreen />);

  await user.paste(screen.getByLabelText("Username"), "ada.lovelace");
  await user.press(screen.getByRole("button", { name: "Continue" }));

  expect(await screen.findByText("This username is taken")).toBeOnTheScreen();
  expect(Alert.alert).not.toHaveBeenCalled();
});
