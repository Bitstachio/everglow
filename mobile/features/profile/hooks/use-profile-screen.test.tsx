import { act, renderHook } from "@testing-library/react-native";
import { useProfileScreen } from "./use-profile-screen";

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockReplace = jest.fn();
let mockCanGoBack = true;
jest.mock("expo-router", () => ({
  router: {
    push: (path: string) => mockPush(path),
    back: () => mockBack(),
    replace: (path: string) => mockReplace(path),
    canGoBack: () => mockCanGoBack,
  },
}));
let mockSub = "auth0|user-1";
jest.mock("react-native-auth0", () => ({ useAuth0: () => ({ user: { sub: mockSub, email: "ada@example.com" } }) }));
jest.mock("./use-lab-card", () => ({
  useLabCard: () => ({ card: { title: "Lab card", fields: [], accessibilityLabel: "" } }),
}));

const mockLogout = jest.fn();
jest.mock("@/context/auth-context", () => ({
  useAuth: () => ({
    user: { id: "user-1", details: { username: "ada", name: "Ada" } },
    logout: mockLogout,
    isLoading: false,
  }),
}));
jest.mock("../api/queries", () => ({ useBlocksQuery: () => ({ data: [{ userId: "u2" }, { userId: "u3" }] }) }));
const mockChangePassword = jest.fn();
jest.mock("./use-change-password", () => ({
  useChangePassword: () => ({
    canChangePassword: mockSub.startsWith("auth0|"),
    isChangingPassword: false,
    handleChangePassword: mockChangePassword,
  }),
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockLogout.mockResolvedValue(undefined);
  mockSub = "auth0|user-1";
  mockCanGoBack = true;
});

test.each([
  ["onEditCard", "/edit-card"],
  ["onOpenUsername", "/edit-username"],
  ["onOpenBlocked", "/blocked-people"],
  ["onOpenPrivacy", "/privacy-policy"],
  ["onDeleteAccount", "/delete-account"],
  ["onOpenTerms", "/terms-of-use"],
] as const)("%s opens %s", async (handler, path) => {
  const { result } = await renderHook(() => useProfileScreen());
  result.current[handler]();
  expect(mockPush).toHaveBeenCalledWith(path);
});

test("an email and password account opens Auth0's page for Password", async () => {
  const { result } = await renderHook(() => useProfileScreen());
  result.current.onOpenPassword();
  expect(mockChangePassword).toHaveBeenCalledTimes(1);
  expect(mockPush).not.toHaveBeenCalled();
});

test("an Apple account opens the explanation for Password", async () => {
  mockSub = "apple|001.abc";
  const { result } = await renderHook(() => useProfileScreen());
  result.current.onOpenPassword();
  expect(mockPush).toHaveBeenCalledWith("/password");
  expect(mockChangePassword).not.toHaveBeenCalled();
});

test("Sign out asks on a slip first, then signs out", async () => {
  const { result } = await renderHook(() => useProfileScreen());
  expect(result.current.signOutVisible).toBe(false);
  await act(() => result.current.onSignOut());
  expect(result.current.signOutVisible).toBe(true);
  expect(mockLogout).not.toHaveBeenCalled();
  await act(() => result.current.onConfirmSignOut());
  expect(result.current.signOutVisible).toBe(false);
  expect(mockLogout).toHaveBeenCalledTimes(1);
});

test("Back returns Home when there is nothing to go back to", async () => {
  mockCanGoBack = false;
  const { result } = await renderHook(() => useProfileScreen());
  result.current.onBack();
  expect(mockReplace).toHaveBeenCalledWith("/events");
});

test("shows the handle and the sign-in email", async () => {
  const { result } = await renderHook(() => useProfileScreen());
  expect(result.current.username).toBe("@ada");
  expect(result.current.email).toBe("ada@example.com");
  expect(result.current.blockedCount).toBe(2);
});
