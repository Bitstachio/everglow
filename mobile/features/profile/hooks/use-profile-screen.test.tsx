import { renderHook } from "@testing-library/react-native";
import { Alert } from "react-native";
import { useProfileScreen } from "./use-profile-screen";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({ router: { push: (path: string) => mockPush(path) } }));

const mockLogout = jest.fn();
const mockDelete = jest.fn();
jest.mock("@/context/auth-context", () => ({
  useAuth: () => ({ user: { id: "user-1" }, logout: mockLogout, isLoading: false }),
}));
jest.mock("../api/mutations", () => ({
  useDeleteProfileMutation: () => ({ mutateAsync: mockDelete, isPending: false }),
}));
jest.mock("./use-edit-profile-form", () => ({
  useEditProfileForm: () => ({ form: { reset: jest.fn(), formState: { isSubmitting: false } }, onSubmit: jest.fn() }),
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
});

test.each([
  ["Keep shared photos", "KEEP"],
  ["Delete my photos", "DELETE"],
])("requires confirmation before deleting with %s", async (choice, policy) => {
  const { result } = await renderHook(() => useProfileScreen());
  result.current.handleDeleteAccount();
  expect(mockDelete).not.toHaveBeenCalled();
  pressAlertButton(choice);
  expect(mockDelete).not.toHaveBeenCalled();
  await pressAlertButton("Delete Account");
  expect(mockDelete).toHaveBeenCalledWith(policy);
  expect(mockLogout).toHaveBeenCalledTimes(1);
});

test("canceling either confirmation leaves the account intact", async () => {
  const { result } = await renderHook(() => useProfileScreen());
  result.current.handleDeleteAccount();
  pressAlertButton("Cancel");
  result.current.handleDeleteAccount();
  pressAlertButton("Keep shared photos");
  pressAlertButton("Cancel");
  expect(mockDelete).not.toHaveBeenCalled();
  expect(mockLogout).not.toHaveBeenCalled();
});

test("failed deletion shows an error without logging out", async () => {
  mockDelete.mockRejectedValue(new Error("Offline"));
  const { result } = await renderHook(() => useProfileScreen());
  result.current.handleDeleteAccount();
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
  result.current.handleDeleteAccount();
  pressAlertButton("Keep shared photos");
  const pending = pressAlertButton("Delete Account");
  await pressAlertButton("Delete Account");
  expect(mockDelete).toHaveBeenCalledTimes(1);
  resolveDeletion();
  await pending;
  expect(mockLogout).toHaveBeenCalledTimes(1);
});

test("opens the dedicated Usage page", async () => {
  const { result } = await renderHook(() => useProfileScreen());
  result.current.handleOpenUsage();
  expect(mockPush).toHaveBeenCalledWith("/usage");
});
