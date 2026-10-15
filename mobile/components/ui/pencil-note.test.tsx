import { render, screen } from "@testing-library/react-native";
import { PencilNote } from "./pencil-note";

test("writes in pencil on the ground", async () => {
  await render(<PencilNote>free on 14 Nov</PencilNote>);
  expect(screen.getByText("free on 14 Nov")).toHaveProp("className", expect.stringContaining("text-pencil"));
});

test("writes in ink on paper", async () => {
  await render(<PencilNote tone="ink">Maya Chen</PencilNote>);
  expect(screen.getByText("Maya Chen")).toHaveProp("className", expect.stringContaining("text-ink-blue"));
});
