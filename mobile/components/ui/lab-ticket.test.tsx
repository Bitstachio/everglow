import { fireEvent, render, screen } from "@testing-library/react-native";
import { LabTicket } from "./lab-ticket";

test("each reason is a checkbox, and the divider sits after its option", async () => {
  const onPress = jest.fn();
  await render(
    <LabTicket
      title="Report a frame"
      options={[
        { key: "rude", label: "Rude or hurtful", checked: true },
        { key: "minor", label: "Involves a minor", checked: false, onPress },
      ]}
      divider={{ afterKey: "rude", label: "Goes straight to Everglow" }}
      footer="Anonymous to hosts."
    />,
  );
  expect(screen.getByRole("checkbox", { name: "Rude or hurtful" })).toBeChecked();
  fireEvent.press(screen.getByRole("checkbox", { name: "Involves a minor" }));
  expect(onPress).toHaveBeenCalledTimes(1);
  expect(screen.getByText("Goes straight to Everglow")).toBeOnTheScreen();
  expect(screen.getByText("Anonymous to hosts.")).toBeOnTheScreen();
});
