import { render, screen, userEvent } from "@testing-library/react-native";
import AccountSettingsScreen from "./account-settings-screen";

const mockScreen = {
  user: {
    id: "user-1",
    details: { name: "Ada", username: "ada", avatarUrl: null as string | null },
  },
  username: "ada",
  handleOpenUsername: jest.fn(),
  handleOpenDisplayName: jest.fn(),
  handleOpenPrivacyPolicy: jest.fn(),
  handleOpenTermsOfUse: jest.fn(),
  hasAvatar: false,
  isUpdatingAvatar: false,
  handleChangeAvatar: jest.fn(),
  canChangePassword: true,
  isChangingPassword: false,
  handleChangePassword: jest.fn(),
  isLoading: false,
  isDeleting: false,
  handleLogout: jest.fn(),
  handleDeleteAccount: jest.fn(),
};

jest.mock("../hooks/use-profile-screen", () => ({ useProfileScreen: () => mockScreen }));

beforeEach(() => {
  jest.clearAllMocks();
  mockScreen.isDeleting = false;
  mockScreen.canChangePassword = true;
  mockScreen.isChangingPassword = false;
  mockScreen.user.details.avatarUrl = null;
  mockScreen.hasAvatar = false;
  mockScreen.isUpdatingAvatar = false;
});

test.each([
  ["Privacy Policy", "handleOpenPrivacyPolicy" as const],
  ["Terms of Use", "handleOpenTermsOfUse" as const],
])("the %s row opens its page", async (label, handler) => {
  await render(<AccountSettingsScreen />);
  const row = screen.getByRole("button", { name: label });
  expect(row).toBeEnabled();
  await userEvent.setup().press(row);
  expect(mockScreen[handler]).toHaveBeenCalledTimes(1);
});

test("the legal rows describe their destination instead of being unavailable", async () => {
  await render(<AccountSettingsScreen />);
  expect(screen.getByText("How we handle your data")).toBeOnTheScreen();
  expect(screen.getByText("The rules for using Everglow")).toBeOnTheScreen();
  expect(screen.queryByText("Not available yet")).not.toBeOnTheScreen();
});

test("the legal rows are unavailable while the account is being deleted", async () => {
  mockScreen.isDeleting = true;
  await render(<AccountSettingsScreen />);
  const privacy = screen.getByRole("button", { name: "Privacy Policy" });
  expect(privacy).toBeDisabled();
  expect(screen.getByRole("button", { name: "Terms of Use" })).toBeDisabled();
  await userEvent.setup().press(privacy);
  expect(mockScreen.handleOpenPrivacyPolicy).not.toHaveBeenCalled();
});

test("Change Password opens the Auth0 flow for database identities", async () => {
  await render(<AccountSettingsScreen />);
  const row = screen.getByRole("button", { name: "Change Password" });
  expect(row).toBeEnabled();
  expect(screen.getByText("Update your sign-in password")).toBeOnTheScreen();
  await userEvent.setup().press(row);
  expect(mockScreen.handleChangePassword).toHaveBeenCalledTimes(1);
});

test("Change Password is hidden for social identities", async () => {
  mockScreen.canChangePassword = false;
  await render(<AccountSettingsScreen />);
  expect(screen.queryByRole("button", { name: "Change Password" })).not.toBeOnTheScreen();
});

test("Change Password is disabled while the browser is opening", async () => {
  mockScreen.isChangingPassword = true;
  await render(<AccountSettingsScreen />);
  const row = screen.getByRole("button", { name: "Opening password page…" });
  expect(row).toBeDisabled();
  await userEvent.setup().press(row);
  expect(mockScreen.handleChangePassword).not.toHaveBeenCalled();
});

test("shows the name and username only in their rows, and has no Change Email row", async () => {
  await render(<AccountSettingsScreen />);
  expect(screen.queryByText("@ada")).not.toBeOnTheScreen();
  expect(screen.getAllByText("ada")).toHaveLength(1);
  expect(screen.getAllByText("Ada")).toHaveLength(1);
  expect(screen.queryByRole("button", { name: "Change Email Address" })).not.toBeOnTheScreen();
  expect(screen.queryByText(/No email added/i)).not.toBeOnTheScreen();
});

test.each([
  ["the initial when there is no avatar", null],
  ["the avatar when one is set", "https://bucket.example.com/avatars/user-1/upload-1?X-Amz-Signature=a"],
])("the profile header shows %s", async (_label, avatarUrl) => {
  mockScreen.user.details.avatarUrl = avatarUrl;
  await render(<AccountSettingsScreen />);
  const hidden = { includeHiddenElements: true };
  expect(screen.queryByTestId("avatar-image", hidden) !== null).toBe(avatarUrl !== null);
  expect(screen.queryByText("A", hidden) !== null).toBe(avatarUrl === null);
});

test.each([
  [false, "Add profile photo"],
  [true, "Change profile photo"],
])("the profile photo opens the photo menu (hasAvatar=%s)", async (hasAvatar, label) => {
  mockScreen.hasAvatar = hasAvatar;
  await render(<AccountSettingsScreen />);
  await userEvent.setup().press(screen.getByRole("button", { name: label }));
  expect(mockScreen.handleChangeAvatar).toHaveBeenCalledTimes(1);
});

test("the profile photo is busy while it uploads", async () => {
  mockScreen.isUpdatingAvatar = true;
  await render(<AccountSettingsScreen />);
  const button = screen.getByRole("button", { name: "Add profile photo" });
  expect(button).toBeDisabled();
  expect(screen.getByLabelText("Updating profile photo")).toBeOnTheScreen();
});
