import { fireEvent, render, screen } from "@testing-library/react-native";
import { OptionRow } from "./option-row";

test("is a radio that names the choice and what it does", async () => {
  const onPress = jest.fn();
  await render(<OptionRow title="Keep them" description="They stay on the roll." selected onPress={onPress} />);
  const row = screen.getByRole("radio", { name: "Keep them. They stay on the roll." });
  expect(row).toBeChecked();
  fireEvent.press(row);
  expect(onPress).toHaveBeenCalledTimes(1);
});
