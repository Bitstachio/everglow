import { I18nProvider } from "@/providers/i18n-provider";
import { renderHook as renderHookBase } from "@testing-library/react-native";
import { useEditUsernameScreen } from "./use-edit-username-screen";

const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockCanGoBack = jest.fn(() => true);
const mockUseEditUsernameForm = jest.fn();
let completeEdit: (() => void) | undefined;
let hitLimit: (() => void) | undefined;
const mockRefreshProfile = jest.fn();
let mockAvailableAt: string | null = null;

jest.mock("@/context/auth-context", () => ({
  useAuth: () => ({
    user: { details: { username: "ada.lovelace", usernameChangeAvailableAt: mockAvailableAt } },
    refreshProfile: () => mockRefreshProfile(),
  }),
}));

jest.mock("expo-router", () => ({
  router: {
    back: () => mockBack(),
    replace: (href: unknown) => mockReplace(href),
    canGoBack: () => mockCanGoBack(),
  },
}));

jest.mock("./use-edit-username-form", () => ({
  useEditUsernameForm: (params: { initialUsername: string; onSuccess: () => void; onLimited: () => void }) => {
    mockUseEditUsernameForm(params.initialUsername);
    completeEdit = params.onSuccess;
    hitLimit = params.onLimited;
    return {
      form: { control: {}, formState: { isDirty: false, isSubmitting: false, errors: {} } },
      onSubmit: jest.fn(),
      availability: { status: "available", canSubmit: true, message: null, reason: null, username: "ada.lovelace" },
    };
  },
}));

const renderHook = <T,>(hook: () => T) => renderHookBase(hook, { wrapper: I18nProvider });

beforeEach(() => {
  jest.clearAllMocks();
  completeEdit = undefined;
  hitLimit = undefined;
  mockAvailableAt = null;
  mockRefreshProfile.mockResolvedValue(null);
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

test("says the date it opens again once both changes are used", async () => {
  mockAvailableAt = new Date(Date.now() + 5 * 86_400_000).toISOString();
  const { result } = await renderHook(() => useEditUsernameScreen());

  expect(result.current.opensOn).toEqual(expect.stringMatching(/\d{1,2} \w{3}|\w{3} \d{1,2}/));
});

test("a date in the past means it can change now", async () => {
  mockAvailableAt = new Date(Date.now() - 86_400_000).toISOString();
  const { result } = await renderHook(() => useEditUsernameScreen());

  expect(result.current.opensOn).toBeNull();
});

test("hitting the limit refreshes the profile to learn the date", async () => {
  await renderHook(() => useEditUsernameScreen());

  hitLimit?.();

  expect(mockRefreshProfile).toHaveBeenCalledTimes(1);
});
