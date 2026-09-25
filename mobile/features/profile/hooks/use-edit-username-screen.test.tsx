import { renderHook } from "@testing-library/react-native";
import { useEditUsernameScreen } from "./use-edit-username-screen";

const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockCanGoBack = jest.fn(() => true);
const mockUseEditUsernameForm = jest.fn();
let completeEdit: (() => void) | undefined;

jest.mock("@/context/auth-context", () => ({
  useAuth: () => ({ user: { details: { username: "ada.lovelace" } } }),
}));

jest.mock("expo-router", () => ({
  router: {
    back: () => mockBack(),
    replace: (href: unknown) => mockReplace(href),
    canGoBack: () => mockCanGoBack(),
  },
}));

jest.mock("./use-edit-username-form", () => ({
  useEditUsernameForm: (params: { initialUsername: string; onSuccess: () => void }) => {
    mockUseEditUsernameForm(params.initialUsername);
    completeEdit = params.onSuccess;
    return {
      form: { control: {}, formState: { isDirty: false, isSubmitting: false, errors: {} } },
      onSubmit: jest.fn(),
      availability: { status: "available", canSubmit: true, message: null, reason: null, username: "ada.lovelace" },
    };
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
  completeEdit = undefined;
  mockCanGoBack.mockReturnValue(true);
});

test("seeds the form from details.username", async () => {
  await renderHook(() => useEditUsernameScreen());

  expect(mockUseEditUsernameForm).toHaveBeenCalledWith("ada.lovelace");
});

test("goes back after a successful save", async () => {
  await renderHook(() => useEditUsernameScreen());

  completeEdit?.();

  expect(mockBack).toHaveBeenCalledTimes(1);
  expect(mockReplace).not.toHaveBeenCalled();
});

test("replaces to account settings when there is nowhere to go back", async () => {
  mockCanGoBack.mockReturnValue(false);
  await renderHook(() => useEditUsernameScreen());

  completeEdit?.();

  expect(mockReplace).toHaveBeenCalledWith("/account-settings");
});
