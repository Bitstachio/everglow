import { render, screen, userEvent, act } from "@testing-library/react-native";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { ThemedText } from "@/components/ui/themed-text";
import { View } from "react-native";
import { useEditDisplayNameForm } from "./use-edit-display-name-form";

const mockSave = jest.fn();
jest.mock("../api/mutations", () => ({ useUpdateProfileMutation: () => ({ mutateAsync: mockSave }) }));

const Probe = ({ initialName = "Ada", onSuccess = jest.fn() }: { initialName?: string; onSuccess?: () => void }) => {
  const { form, onSubmit } = useEditDisplayNameForm({ initialName, onSuccess });
  return (
    <View>
      <FormField
        control={form.control}
        name="name"
        label="Display Name"
        accessibilityLabel="Display Name"
        editable={!form.formState.isSubmitting}
      />
      {form.formState.errors.root?.server?.message ? (
        <ThemedText accessibilityRole="alert">{form.formState.errors.root.server.message}</ThemedText>
      ) : null}
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
  mockSave.mockReset();
  mockSave.mockResolvedValue({});
});

const fillName = async (value: string) => {
  const user = userEvent.setup();
  await user.clear(screen.getByLabelText("Display Name"));
  await user.paste(screen.getByLabelText("Display Name"), value);
  return user;
};

test("prefills the display name and disables unchanged Save", async () => {
  await render(<Probe />);
  expect(screen.getByLabelText("Display Name")).toHaveDisplayValue("Ada");
  expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
});

test("saves only the trimmed name and then reports success", async () => {
  const success = jest.fn();
  await render(<Probe onSuccess={success} />);
  const user = await fillName("  Ada Lovelace  ");
  await user.press(screen.getByRole("button", { name: "Save" }));
  expect(mockSave).toHaveBeenCalledWith({ name: "Ada Lovelace" });
  expect(mockSave).toHaveBeenCalledTimes(1);
  expect(success).toHaveBeenCalledTimes(1);
});

test.each([
  ["   ", "Display name is required"],
  ["a".repeat(256), "Display name must be 255 characters or fewer"],
])("rejects invalid name %s", async (name, message) => {
  await render(<Probe />);
  const user = await fillName(name);
  await user.press(screen.getByRole("button", { name: "Save" }));
  expect(await screen.findByText(message)).toBeOnTheScreen();
  expect(mockSave).not.toHaveBeenCalled();
});

test("preserves the draft after a failure and allows retry", async () => {
  const success = jest.fn();
  mockSave.mockRejectedValueOnce(new Error("Could not save"));
  await render(<Probe onSuccess={success} />);
  const user = await fillName("Grace");
  await user.press(screen.getByRole("button", { name: "Save" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Could not save");
  expect(screen.getByLabelText("Display Name")).toHaveDisplayValue("Grace");
  expect(success).not.toHaveBeenCalled();
  await user.press(screen.getByRole("button", { name: "Save" }));
  expect(success).toHaveBeenCalledTimes(1);
});

test("disables saving and editing while the request is pending", async () => {
  let finish!: () => void;
  mockSave.mockReturnValue(
    new Promise<void>((resolve) => {
      finish = resolve;
    }),
  );
  await render(<Probe />);
  const user = await fillName("Grace");
  await user.press(screen.getByRole("button", { name: "Save" }));
  expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  expect(screen.getByLabelText("Display Name")).toHaveProp("editable", false);
  await user.press(screen.getByRole("button", { name: "Save" }));
  expect(mockSave).toHaveBeenCalledTimes(1);
  await act(async () => finish());
});

test("updates a pristine form from profile data without replacing a draft", async () => {
  const { rerender } = await render(<Probe initialName="" />);
  await rerender(<Probe initialName="Ada" />);
  expect(screen.getByLabelText("Display Name")).toHaveDisplayValue("Ada");
  await fillName("Grace");
  await rerender(<Probe initialName="Ada Lovelace" />);
  expect(screen.getByLabelText("Display Name")).toHaveDisplayValue("Grace");
});

test("does not send a request for whitespace-only changes", async () => {
  await render(<Probe />);
  const user = await fillName(" Ada ");
  await user.press(screen.getByRole("button", { name: "Save" }));
  expect(mockSave).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
});
