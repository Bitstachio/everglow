import { renderHook } from "@testing-library/react-native";
import { useEditUsernameScreen } from "./use-edit-username-screen";

const mockDismissTo = jest.fn();
const mockUseEditUsernameForm = jest.fn();
let completeEdit: ((username: string) => void) | undefined;

jest.mock("@/context/auth-context", () => ({
  useAuth: () => ({ user: { details: { email: "ada@example.com" } } }),
}));

jest.mock("expo-router", () => ({
  router: { dismissTo: (href: unknown) => mockDismissTo(href) },
  useLocalSearchParams: () => ({ username: "current.username" }),
}));

jest.mock("./use-edit-username-form", () => ({
  useEditUsernameForm: (params: { initialUsername: string; onSuccess: (username: string) => void }) => {
    mockUseEditUsernameForm(params.initialUsername);
    completeEdit = params.onSuccess;
    return { form: { control: {} }, onSubmit: jest.fn() };
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
  completeEdit = undefined;
});

test("seeds the form from the username route parameter", async () => {
  await renderHook(() => useEditUsernameScreen());

  expect(mockUseEditUsernameForm).toHaveBeenCalledWith("current.username");
});

test("returns the saved username to account settings", async () => {
  await renderHook(() => useEditUsernameScreen());

  completeEdit?.("new.username");

  expect(mockDismissTo).toHaveBeenCalledWith({
    pathname: "/account-settings",
    params: { username: "new.username" },
  });
});
