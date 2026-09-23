import { zodResolver } from "@hookform/resolvers/zod";
import { render, screen, userEvent, waitFor } from "@testing-library/react-native";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "./button";
import { FormField } from "./form-field";
import { View } from "react-native";

const schema = z.object({
  invitationUrl: z.string().trim().min(1, "Invitation is required"),
});

type Values = z.infer<typeof schema>;

const Probe = () => {
  const { control, handleSubmit } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { invitationUrl: "" },
  });

  return (
    <View>
      <FormField
        control={control}
        name="invitationUrl"
        label="Invitation"
        accessibilityLabel="Invitation field"
        placeholder="paste link"
      />
      <Button title="Submit" onPress={handleSubmit(() => undefined)} />
    </View>
  );
};

test("wires text into the form and surfaces schema errors", async () => {
  await render(<Probe />);
  const user = userEvent.setup();
  const field = screen.getByLabelText("Invitation field");

  await user.press(screen.getByRole("button", { name: "Submit" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Invitation is required");

  await user.type(field, "invite-token");
  await waitFor(() => expect(screen.queryByRole("alert")).not.toBeOnTheScreen());
  expect(field).toHaveDisplayValue("invite-token");
});
