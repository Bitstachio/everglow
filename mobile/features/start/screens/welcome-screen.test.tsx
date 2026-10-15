import { renderWithI18n } from "@/testing/render";
import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import WelcomeScreen from "./welcome-screen";

const mockLogin = jest.fn();
const mockSignup = jest.fn();
const mockAlert = jest.fn();

jest.mock("@/context/auth-context", () => ({
  useAuth: () => ({ login: mockLogin, signup: mockSignup, isLoading: false }),
}));

jest.mock("react-native/Libraries/Alert/Alert", () => ({
  __esModule: true,
  default: { alert: (...args: unknown[]) => mockAlert(...args) },
}));

beforeEach(() => {
  mockLogin.mockReset().mockResolvedValue(undefined);
  mockSignup.mockReset().mockResolvedValue(undefined);
});

test("pitches the app and starts a roll through sign-up", async () => {
  await renderWithI18n(<WelcomeScreen />);
  expect(screen.getByRole("header", { name: "Everyone’s photos.\nOne roll for the night." })).toBeOnTheScreen();
  fireEvent.press(screen.getByRole("button", { name: "Start a roll" }));
  await waitFor(() => expect(mockSignup).toHaveBeenCalledTimes(1));
  expect(mockLogin).not.toHaveBeenCalled();
});

test("Sign in opens the sign-in step", async () => {
  await renderWithI18n(<WelcomeScreen />);
  fireEvent.press(screen.getByRole("button", { name: "Sign in" }));
  await waitFor(() => expect(mockLogin).toHaveBeenCalledTimes(1));
});

test("a failed sign-in says so", async () => {
  mockLogin.mockRejectedValue(new Error("Authentication failed. Please try again."));
  await renderWithI18n(<WelcomeScreen />);
  fireEvent.press(screen.getByRole("button", { name: "Sign in" }));
  await waitFor(() =>
    expect(mockAlert).toHaveBeenCalledWith("Couldn’t sign in", "Authentication failed. Please try again."),
  );
});

test("the contact sheet is decorative", async () => {
  await renderWithI18n(<WelcomeScreen />);
  expect(screen.queryByText("Every photo from the night, one roll")).not.toBeOnTheScreen();
});
