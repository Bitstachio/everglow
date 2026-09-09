import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { render, screen, userEvent } from "@testing-library/react-native";
import { View } from "react-native";
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

const EditProfileFormProbe = ({ onSuccess = jest.fn() }: { onSuccess?: () => void }) => {
  const { form, onSubmit } = useEditProfileForm({ user: userProfile, onSuccess });

  return (
    <View>
      <FormField control={form.control} name="name" label="Name" placeholder="Enter your name" />
      <FormField control={form.control} name="email" label="Email" placeholder="Enter your email" />
      <Button
        title="Save"
        onPress={onSubmit}
        isLoading={form.formState.isSubmitting}
        disabled={form.formState.isSubmitting || !form.formState.isDirty}
      />
    </View>
  );
};

beforeEach(() => {
  mockMutateAsync.mockReset();
  mockMutateAsync.mockResolvedValue({});
});

test("submits only changed profile fields", async () => {
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
});

test("shows a validation message and does not submit when name is empty", async () => {
  const user = userEvent.setup();

  await render(<EditProfileFormProbe />);

  await user.clear(screen.getByPlaceholderText("Enter your name"));
  await user.press(screen.getByText("Save"));

  expect(screen.getByText("Name is required")).toBeOnTheScreen();
  expect(mockMutateAsync).not.toHaveBeenCalled();
});
