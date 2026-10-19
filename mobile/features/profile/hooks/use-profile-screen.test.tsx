import { act, renderHook } from "@testing-library/react-native";
import { Alert } from "react-native";
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
const mockDelete = jest.fn();
jest.mock("@/context/auth-context", () => ({
  useAuth: () => ({
    user: { id: "user-1", details: { username: "ada", name: "Ada" } },
    logout: mockLogout,
    isLoading: false,
  }),
}));
jest.mock("../api/queries", () => ({ useBlocksQuery: () => ({ data: [{ userId: "u2" }, { userId: "u3" }] }) }));
jest.mock("../api/mutations", () => ({
  useDeleteProfileMutation: () => ({ mutateAsync: mockDelete, isPending: false }),
}));
const mockChangePassword = jest.fn();
jest.mock("./use-change-password", () => ({
  useChangePassword: () => ({
    canChangePassword: mockSub.startsWith("auth0|"),
    isChangingPassword: false,
    handleChangePassword: mockChangePassword,
  }),
}));

const alert = jest.spyOn(Alert, "alert");
const pressAlertButton = (title: string) => {
  const buttons = alert.mock.calls.at(-1)?.[2];
  const button = buttons?.find((item) => item.text === title);
  if (!button) throw new Error(`Missing alert button: ${title}`);
  return button.onPress?.();
};

beforeEach(() => {
  jest.clearAllMocks();
  mockDelete.mockResolvedValue(undefined);
  mockLogout.mockResolvedValue(undefined);
  mockSub = "auth0|user-1";
  mockCanGoBack = true;
});

test.each([
  ["Keep shared photos", "KEEP"],
  ["Delete my photos", "DELETE"],
])("requires confirmation before deleting with %s", async (choice, policy) => {
  const { result } = await renderHook(() => useProfileScreen());
  result.current.onDeleteAccount();
  expect(mockDelete).not.toHaveBeenCalled();
  pressAlertButton(choice);
  expect(mockDelete).not.toHaveBeenCalled();
  await pressAlertButton("Delete Account");
  expect(mockDelete).toHaveBeenCalledWith(policy);
  expect(mockLogout).toHaveBeenCalledTimes(1);
});

test("canceling either confirmation leaves the account intact", async () => {
  const { result } = await renderHook(() => useProfileScreen());
  result.current.onDeleteAccount();
  pressAlertButton("Cancel");
  result.current.onDeleteAccount();
  pressAlertButton("Keep shared photos");
  pressAlertButton("Cancel");
  expect(mockDelete).not.toHaveBeenCalled();
  expect(mockLogout).not.toHaveBeenCalled();
});

test("failed deletion shows an error without logging out", async () => {
  mockDelete.mockRejectedValue(new Error("Offline"));
  const { result } = await renderHook(() => useProfileScreen());
  result.current.onDeleteAccount();
  pressAlertButton("Delete my photos");
  await pressAlertButton("Delete Account");
  expect(alert).toHaveBeenLastCalledWith("Could not delete account", expect.any(String));
  expect(mockLogout).not.toHaveBeenCalled();
});

test("ignores duplicate confirmations while deletion is pending", async () => {
  let resolveDeletion!: () => void;
  mockDelete.mockReturnValue(
    new Promise<void>((resolve) => {
      resolveDeletion = resolve;
    }),
  );
  const { result } = await renderHook(() => useProfileScreen());
  result.current.onDeleteAccount();
  pressAlertButton("Keep shared photos");
  const pending = pressAlertButton("Delete Account");
  await pressAlertButton("Delete Account");
  expect(mockDelete).toHaveBeenCalledTimes(1);
  resolveDeletion();
  await pending;
  expect(mockLogout).toHaveBeenCalledTimes(1);
});

test.each([
  ["onEditCard", "/edit-card"],
  ["onOpenUsername", "/edit-username"],
  ["onOpenBlocked", "/blocked-people"],
  ["onOpenPrivacy", "/privacy-policy"],
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
