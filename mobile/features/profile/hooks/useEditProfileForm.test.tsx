import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { render, screen, userEvent } from "@testing-library/react-native";
import { Alert, View } from "react-native";
import type { UserResponseDto } from "../types";
import { useEditProfileForm } from "./useEditProfileForm";

const mockMutateAsync = jest.fn();

jest.mock("../api/mutations", () => ({
  useUpdateProfileMutation: () => ({
    mutateAsync: mockMutateAsync,
  }),
}));

const userProfile: UserResponseDto = {
  id: "user-1",
  isOnboarded: true,
  details: {
    name: "Ada",
    email: "ada@example.com",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

type EditProfileFormProbeProps = {
  user?: UserResponseDto | null;
  onSuccess?: () => void;
  /** When false, Save stays pressable even if the form is clean (exercises empty-patch submit). */
  requireDirty?: boolean;
};

const EditProfileFormProbe = ({
  user = userProfile,
  onSuccess = jest.fn(),
  requireDirty = true,
}: EditProfileFormProbeProps) => {
  const { form, onSubmit } = useEditProfileForm({ user, onSuccess });

  return (
    <View>
      <FormField control={form.control} name="name" label="Name" placeholder="Enter your name" />
      <FormField control={form.control} name="email" label="Email" placeholder="Enter your email" />
      <Button
        title="Save"
        onPress={onSubmit}
        isLoading={form.formState.isSubmitting}
        disabled={form.formState.isSubmitting || (requireDirty && !form.formState.isDirty)}
      />
    </View>
  );
};

beforeEach(() => {
  mockMutateAsync.mockReset();
  mockMutateAsync.mockResolvedValue({});
  jest.spyOn(Alert, "alert").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

test("seeds fields from the logged-in user", async () => {
  await render(<EditProfileFormProbe />);

  expect(screen.getByDisplayValue("Ada")).toBeOnTheScreen();
  expect(screen.getByDisplayValue("ada@example.com")).toBeOnTheScreen();
  expect(screen.getByText("Save")).toBeDisabled();
});

test("hydrates fields when user details arrive after mount", async () => {
  const { rerender } = await render(<EditProfileFormProbe user={null} />);

  expect(screen.getByPlaceholderText("Enter your name")).toHaveDisplayValue("");
  expect(screen.getByPlaceholderText("Enter your email")).toHaveDisplayValue("");

  await rerender(<EditProfileFormProbe user={userProfile} />);

  expect(screen.getByDisplayValue("Ada")).toBeOnTheScreen();
  expect(screen.getByDisplayValue("ada@example.com")).toBeOnTheScreen();
});

test("submits only the changed name field", async () => {
  const onSuccess = jest.fn();
  const user = userEvent.setup();

  await render(<EditProfileFormProbe onSuccess={onSuccess} />);

  const nameInput = screen.getByPlaceholderText("Enter your name");
  await user.clear(nameInput);
  await user.type(nameInput, "Ada Lovelace");
  await user.press(screen.getByText("Save"));

  expect(mockMutateAsync).toHaveBeenCalledTimes(1);
  expect(mockMutateAsync).toHaveBeenCalledWith({ name: "Ada Lovelace" });
  expect(onSuccess).toHaveBeenCalledTimes(1);
  expect(Alert.alert).not.toHaveBeenCalled();
});

test("submits only the changed email field", async () => {
  const onSuccess = jest.fn();
  const user = userEvent.setup();

  await render(<EditProfileFormProbe onSuccess={onSuccess} />);

  const emailInput = screen.getByPlaceholderText("Enter your email");
  await user.clear(emailInput);
  await user.type(emailInput, "lovelace@example.com");
  await user.press(screen.getByText("Save"));

  expect(mockMutateAsync).toHaveBeenCalledTimes(1);
  expect(mockMutateAsync).toHaveBeenCalledWith({ email: "lovelace@example.com" });
  expect(onSuccess).toHaveBeenCalledTimes(1);
});

test("submits both fields when both are changed", async () => {
  const onSuccess = jest.fn();
  const user = userEvent.setup();

  await render(<EditProfileFormProbe onSuccess={onSuccess} />);

  const nameInput = screen.getByPlaceholderText("Enter your name");
  const emailInput = screen.getByPlaceholderText("Enter your email");
  await user.clear(nameInput);
  await user.type(nameInput, "Ada Lovelace");
  await user.clear(emailInput);
  await user.type(emailInput, "lovelace@example.com");
  await user.press(screen.getByText("Save"));

  expect(mockMutateAsync).toHaveBeenCalledTimes(1);
  expect(mockMutateAsync).toHaveBeenCalledWith({
    name: "Ada Lovelace",
    email: "lovelace@example.com",
  });
  expect(onSuccess).toHaveBeenCalledTimes(1);
});

test("calls onSuccess without hitting the API when there are no dirty fields", async () => {
  const onSuccess = jest.fn();
  const user = userEvent.setup();

  await render(<EditProfileFormProbe onSuccess={onSuccess} requireDirty={false} />);

  await user.press(screen.getByText("Save"));

  expect(mockMutateAsync).not.toHaveBeenCalled();
  expect(onSuccess).toHaveBeenCalledTimes(1);
});

test("resets dirty state after a successful submit", async () => {
  const user = userEvent.setup();

  await render(<EditProfileFormProbe />);

  const nameInput = screen.getByPlaceholderText("Enter your name");
  await user.clear(nameInput);
  await user.type(nameInput, "Ada Lovelace");
  expect(screen.getByText("Save")).toBeEnabled();

  await user.press(screen.getByText("Save"));

  expect(screen.getByText("Save")).toBeDisabled();
  expect(screen.getByDisplayValue("Ada Lovelace")).toBeOnTheScreen();
});

test("shows a validation message and does not submit when name is empty", async () => {
  const user = userEvent.setup();

  await render(<EditProfileFormProbe />);

  await user.clear(screen.getByPlaceholderText("Enter your name"));
  await user.press(screen.getByText("Save"));

  expect(screen.getByText("Name is required")).toBeOnTheScreen();
  expect(mockMutateAsync).not.toHaveBeenCalled();
});

test("shows a validation message and does not submit when name is whitespace only", async () => {
  const user = userEvent.setup();

  await render(<EditProfileFormProbe />);

  const nameInput = screen.getByPlaceholderText("Enter your name");
  await user.clear(nameInput);
  await user.type(nameInput, "   ");
  await user.press(screen.getByText("Save"));

  expect(screen.getByText("Name is required")).toBeOnTheScreen();
  expect(mockMutateAsync).not.toHaveBeenCalled();
});

test("shows a validation message and does not submit when email is invalid", async () => {
  const user = userEvent.setup();

  await render(<EditProfileFormProbe />);

  const emailInput = screen.getByPlaceholderText("Enter your email");
  await user.clear(emailInput);
  await user.type(emailInput, "not-an-email");
  await user.press(screen.getByText("Save"));

  expect(screen.getByText("Enter a valid email")).toBeOnTheScreen();
  expect(mockMutateAsync).not.toHaveBeenCalled();
});

test("alerts and does not call onSuccess when the mutation fails", async () => {
  const onSuccess = jest.fn();
  const user = userEvent.setup();
  mockMutateAsync.mockRejectedValueOnce(new Error("Server unavailable"));

  await render(<EditProfileFormProbe onSuccess={onSuccess} />);

  const nameInput = screen.getByPlaceholderText("Enter your name");
  await user.clear(nameInput);
  await user.type(nameInput, "Ada Lovelace");
  await user.press(screen.getByText("Save"));

  expect(mockMutateAsync).toHaveBeenCalledTimes(1);
  expect(onSuccess).not.toHaveBeenCalled();
  expect(Alert.alert).toHaveBeenCalledWith("Error", "Server unavailable");
});
