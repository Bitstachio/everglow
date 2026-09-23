import { render, screen } from "@testing-library/react-native";
import { ThemedText } from "./themed-text";

test("renders children", async () => {
  await render(<ThemedText>Hello</ThemedText>);
  expect(screen.getByText("Hello")).toBeOnTheScreen();
});

test("applies tone class for danger", async () => {
  await render(<ThemedText tone="danger">Broken</ThemedText>);
  expect(screen.getByText("Broken")).toHaveProp("className", expect.stringContaining("text-danger"));
});
