import { render, screen } from "@testing-library/react-native";
import { Spinner } from "./spinner";

test("renders with a default loading label", async () => {
  await render(<Spinner />);
  expect(screen.getByLabelText("Loading")).toBeOnTheScreen();
});

test("accepts a custom accessibility label", async () => {
  await render(<Spinner label="Loading events" size="large" />);
  expect(screen.getByLabelText("Loading events")).toBeOnTheScreen();
});
