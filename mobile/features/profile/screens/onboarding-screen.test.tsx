import { render, screen, userEvent, waitFor } from "@testing-library/react-native";
import { createApiError } from "@/lib/api/errors";
import OnboardingScreen from "./onboarding-screen";

const mockCompleteOnboarding = jest.fn();
const mockClearError = jest.fn();
const mockReplace = jest.fn();
const mockPush = jest.fn();
const mockAlert = jest.fn();

jest.mock("expo-router", () => ({
  router: { replace: (href: unknown) => mockReplace(href), push: (href: unknown) => mockPush(href) },
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

jest.mock("react-native/Libraries/Alert/Alert", () => ({
  alert: (...args: unknown[]) => mockAlert(...args),
}));

const mockAvailability = jest.fn();
jest.mock("../hooks/use-username-availability", () => ({
  useUsernameAvailability: (...args: unknown[]) => mockAvailability(...args),
}));

beforeEach(() => {
  jest.clearAllMocks();
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

const acceptTerms = (user: ReturnType<typeof userEvent.setup>) =>
  user.press(screen.getByRole("checkbox", { name: "I agree to the Terms of Use and Privacy Policy" }));

test("submits name, username and the terms acceptance, without email", async () => {
  const user = userEvent.setup();
  await render(<OnboardingScreen />);

  await user.paste(screen.getByLabelText("Username"), "ada.lovelace");
  await acceptTerms(user);
  await user.press(screen.getByRole("button", { name: "Continue" }));

  await waitFor(() =>
    expect(mockCompleteOnboarding).toHaveBeenCalledWith({
      name: "Ada Lovelace",
      username: "ada.lovelace",
      acceptedTerms: true,
    }),
  );
});

test("keeps Continue disabled until the terms are accepted, and again when unticked", async () => {
  const user = userEvent.setup();
  await render(<OnboardingScreen />);
  await user.paste(screen.getByLabelText("Username"), "ada.lovelace");

  const checkbox = screen.getByRole("checkbox", { name: "I agree to the Terms of Use and Privacy Policy" });
  expect(checkbox).not.toBeChecked();
  expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();

  await acceptTerms(user);
  expect(checkbox).toBeChecked();
  expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled();

  await acceptTerms(user);
  expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
  expect(mockCompleteOnboarding).not.toHaveBeenCalled();
});

test.each([
  ["Terms of Use", "/terms-of-use"],
  ["Privacy Policy", "/privacy-policy"],
])("opens the %s from the consent text", async (label, route) => {
  const user = userEvent.setup();
  await render(<OnboardingScreen />);

  await user.press(screen.getByRole("link", { name: label }));

  expect(mockPush).toHaveBeenCalledWith(route);
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
    createApiError("Username already exists", { status: 409, code: "USERNAME_TAKEN" }),
  );
  const user = userEvent.setup();
  await render(<OnboardingScreen />);

  await user.paste(screen.getByLabelText("Username"), "ada.lovelace");
  await acceptTerms(user);
  await user.press(screen.getByRole("button", { name: "Continue" }));

  expect(await screen.findByText("This username is taken")).toBeOnTheScreen();
  expect(mockAlert).not.toHaveBeenCalled();
});
