import { render, screen } from "@testing-library/react-native";
import { Stamp } from "./stamp";

test("is decorative: assistive tech skips it", async () => {
  await render(<Stamp title="Join" subtitle="The roll" />);
  expect(screen.queryByText("Join")).not.toBeOnTheScreen();
  expect(screen.getByText("Join", { includeHiddenElements: true })).toBeTruthy();
});
