import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { ThemedText } from "@/components/ui/themed-text";
import { act, render, screen, userEvent } from "@testing-library/react-native";
import { View } from "react-native";
import { createApiError } from "@/lib/api/errors";
import { useEditUsernameForm } from "./use-edit-username-form";

const mockSave = jest.fn();
jest.mock("../api/mutations", () => ({ useUpdateProfileMutation: () => ({ mutateAsync: mockSave }) }));

const mockAvailability = jest.fn();
jest.mock("./use-username-availability", () => ({
  useUsernameAvailability: (...args: unknown[]) => mockAvailability(...args),
}));

const EditUsernameFormProbe = ({
  initialUsername = "ada",
  onSuccess = jest.fn(),
}: {
  initialUsername?: string;
  onSuccess?: () => void;
}) => {
  const { form, onSubmit, availability } = useEditUsernameForm({ initialUsername, onSuccess });

  return (
    <View>
      <FormField
        control={form.control}
        name="username"
        label="Username"
        accessibilityLabel="Username"
        placeholder="Enter your username"
        editable={!form.formState.isSubmitting}
      />
      {form.formState.errors.root?.server?.message ? (
        <ThemedText accessibilityRole="alert">{form.formState.errors.root.server.message}</ThemedText>
      ) : null}
      <Button
        title="Save"
        onPress={onSubmit}
        isLoading={form.formState.isSubmitting}
        disabled={form.formState.isSubmitting || !form.formState.isDirty || !availability.canSubmit}
      />
    </View>
  );
};

beforeEach(() => {
  mockSave.mockReset();
  mockSave.mockResolvedValue({});
  mockAvailability.mockReturnValue({
    status: "available",
    username: "ada.lovelace",
    reason: null,
    message: "Username is available",
    canSubmit: true,
  });
});

const fillUsername = async (value: string) => {
  const user = userEvent.setup();
  await user.clear(screen.getByLabelText("Username"));
  await user.paste(screen.getByLabelText("Username"), value);
  return user;
};

test("saves a valid username through the profile mutation", async () => {
  const onSuccess = jest.fn();
  await render(<EditUsernameFormProbe onSuccess={onSuccess} />);

  const user = await fillUsername("ada.lovelace");
  await user.press(screen.getByRole("button", { name: "Save" }));

  expect(mockSave).toHaveBeenCalledWith({ username: "ada.lovelace" });
  expect(onSuccess).toHaveBeenCalledTimes(1);
});

test("rejects unsupported username characters", async () => {
  const onSuccess = jest.fn();
  await render(<EditUsernameFormProbe onSuccess={onSuccess} />);

  const user = await fillUsername("Ada Lovelace");
  await user.press(screen.getByRole("button", { name: "Save" }));

  expect(screen.getByRole("alert")).toHaveTextContent("Use lowercase letters, numbers, periods, or underscores");
  expect(mockSave).not.toHaveBeenCalled();
  expect(onSuccess).not.toHaveBeenCalled();
});

test("shows taken when save loses a uniqueness race", async () => {
  mockSave.mockRejectedValueOnce(createApiError("Username already exists", { status: 409, code: "USERNAME_TAKEN" }));
  const onSuccess = jest.fn();
  await render(<EditUsernameFormProbe onSuccess={onSuccess} />);

  const user = await fillUsername("taken.name");
  await user.press(screen.getByRole("button", { name: "Save" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("This username is taken");
  expect(onSuccess).not.toHaveBeenCalled();
});

test("does not save while availability forbids submit", async () => {
  mockAvailability.mockReturnValue({
    status: "unavailable",
    username: "taken.name",
    reason: "TAKEN",
    message: "This username is taken",
    canSubmit: false,
  });
  await render(<EditUsernameFormProbe />);

  const user = await fillUsername("taken.name");
  await user.press(screen.getByRole("button", { name: "Save" }));

  expect(mockSave).not.toHaveBeenCalled();
});

test("disables saving while the request is pending", async () => {
  let finish!: () => void;
  mockSave.mockReturnValue(
    new Promise<void>((resolve) => {
      finish = resolve;
    }),
  );
  await render(<EditUsernameFormProbe />);
  const user = await fillUsername("grace.hopper");
  await user.press(screen.getByRole("button", { name: "Save" }));
  expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  expect(screen.getByLabelText("Username")).toHaveProp("editable", false);
  await act(async () => finish());
});
