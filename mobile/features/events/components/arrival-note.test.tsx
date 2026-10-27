import { render, screen } from "@testing-library/react-native";
import { ArrivalNote } from "./arrival-note";

test("announces the note", async () => {
  await render(<ArrivalNote label="You’re already on this roll" />);

  expect(screen.getByRole("alert")).toHaveTextContent(/You’re already on this roll/);
});
