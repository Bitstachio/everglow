import { fireEvent, render, screen } from "@testing-library/react-native";
import { FilmBox } from "./film-box";

test("is a radio choice of gallery length", async () => {
  const onPress = jest.fn();
  await render(<FilmBox days={7} label="days" selected accessibilityLabel="7 days" onPress={onPress} />);
  const box = screen.getByRole("radio", { name: "7 days" });
  expect(box).toBeChecked();
  fireEvent.press(box);
  expect(onPress).toHaveBeenCalledTimes(1);
});

test("prints the film's name above the number", async () => {
  await render(<FilmBox days={3} name="Weekend" label="days" accessibilityLabel="Weekend, 3 days" />);
  expect(screen.getByText("Weekend")).toBeOnTheScreen();
  expect(screen.getByText("3")).toBeOnTheScreen();
  expect(screen.getByRole("radio", { name: "Weekend, 3 days" })).not.toBeChecked();
});
