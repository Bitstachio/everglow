import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { render, screen, userEvent } from "@testing-library/react-native";
import { View } from "react-native";
import { useEditUsernameForm } from "./use-edit-username-form";

const EditUsernameFormProbe = ({ onSuccess }: { onSuccess: (username: string) => void }) => {
  const { form, onSubmit } = useEditUsernameForm({ initialUsername: "ada", onSuccess });

  return (
    <View>
      <FormField
        control={form.control}
        name="username"
        label="Username"
        accessibilityLabel="Username"
        placeholder="Enter your username"
      />
      <Button title="Save" onPress={onSubmit} disabled={!form.formState.isDirty} />
    </View>
  );
};

test("submits a valid normalized username", async () => {
  const onSuccess = jest.fn();
  const user = userEvent.setup();
  await render(<EditUsernameFormProbe onSuccess={onSuccess} />);

  const input = screen.getByLabelText("Username");
  await user.clear(input);
  await user.paste(input, "ada.lovelace");
  await user.press(screen.getByRole("button", { name: "Save" }));

  expect(onSuccess).toHaveBeenCalledWith("ada.lovelace");
});

test("rejects unsupported username characters", async () => {
  const onSuccess = jest.fn();
  const user = userEvent.setup();
  await render(<EditUsernameFormProbe onSuccess={onSuccess} />);

  const input = screen.getByLabelText("Username");
  await user.clear(input);
  await user.paste(input, "Ada Lovelace");
  await user.press(screen.getByRole("button", { name: "Save" }));

  expect(screen.getByRole("alert")).toHaveTextContent("Use lowercase letters, numbers, periods, or underscores");
  expect(onSuccess).not.toHaveBeenCalled();
});
