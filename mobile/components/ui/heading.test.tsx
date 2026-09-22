import { render, screen } from "@testing-library/react-native";
import { H1, H2, H3 } from "./heading";

test("exposes header roles for each level", async () => {
  await render(
    <>
      <H1>One</H1>
      <H2>Two</H2>
      <H3>Three</H3>
    </>,
  );
  expect(screen.getByRole("header", { name: "One" })).toBeOnTheScreen();
  expect(screen.getByRole("header", { name: "Two" })).toBeOnTheScreen();
  expect(screen.getByRole("header", { name: "Three" })).toBeOnTheScreen();
});
