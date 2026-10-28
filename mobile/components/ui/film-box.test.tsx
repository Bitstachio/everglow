import { fireEvent, render, screen } from "@testing-library/react-native";
import { FilmBox } from "./film-box";

test("is a radio choice of gallery length", async () => {
  const onPress = jest.fn();
  await render(<FilmBox days={7} label="day roll" selected accessibilityLabel="7-day roll" onPress={onPress} />);
  const box = screen.getByRole("radio", { name: "7-day roll" });
  expect(box).toBeChecked();
  fireEvent.press(box);
  expect(onPress).toHaveBeenCalledTimes(1);
});

test("prints the film's name above the number", async () => {
  await render(<FilmBox days={3} name="Weekend" label="day roll" accessibilityLabel="Weekend, 3-day roll" />);
  expect(screen.getByText("Weekend")).toBeOnTheScreen();
  expect(screen.getByText("3")).toBeOnTheScreen();
  expect(screen.getByRole("radio", { name: "Weekend, 3-day roll" })).not.toBeChecked();
});
