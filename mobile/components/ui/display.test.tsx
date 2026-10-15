import { render, screen } from "@testing-library/react-native";
import { Display, Wordmark } from "./display";

test("renders a screen title as a header, with its dim second line", async () => {
  await render(<Display dim="are in use.">Both rolls</Display>);
  expect(screen.getByRole("header")).toHaveTextContent("Both rolls\nare in use.");
  expect(screen.getByText("are in use.")).toHaveProp("className", expect.stringContaining("text-text-2"));
});

test("a roll name on Home is not a header", async () => {
  await render(<Display variant="roll">Nadia turns 30</Display>);
  expect(screen.queryByRole("header")).not.toBeOnTheScreen();
  expect(screen.getByText("Nadia turns 30")).toHaveProp("className", expect.stringContaining("text-title-roll"));
});

test("the wordmark is the name alone", async () => {
  await render(<Wordmark />);
  expect(screen.getByRole("header")).toHaveTextContent("Everglow");
});
