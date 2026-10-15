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
