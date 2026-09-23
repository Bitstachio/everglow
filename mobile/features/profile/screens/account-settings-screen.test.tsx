import { render, screen, userEvent } from "@testing-library/react-native";
import AccountSettingsScreen from "./account-settings-screen";

const mockScreen = {
  user: { details: { name: "Ada", email: "ada@example.com" } },
  username: "ada",
  handleOpenUsername: jest.fn(),
  handleOpenUsage: jest.fn(),
  handleOpenDisplayName: jest.fn(),
  handleOpenPrivacyPolicy: jest.fn(),
  handleOpenTermsOfUse: jest.fn(),
  isLoading: false,
  isDeleting: false,
  showEditModal: false,
  form: { control: undefined, formState: { isSubmitting: false, isDirty: false } },
  onSubmit: jest.fn(),
  handleLogout: jest.fn(),
  handleEditProfile: jest.fn(),
  handleDeleteAccount: jest.fn(),
  handleCancelEdit: jest.fn(),
};

jest.mock("../hooks/use-profile-screen", () => ({ useProfileScreen: () => mockScreen }));
jest.mock("../components/edit-profile-modal", () => ({ EditProfileModal: () => null }));

beforeEach(() => {
  jest.clearAllMocks();
  mockScreen.isDeleting = false;
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
