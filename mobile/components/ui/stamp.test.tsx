import { render, screen } from "@testing-library/react-native";
import { Stamp } from "./stamp";

test("is decorative: assistive tech skips it", async () => {
  await render(<Stamp title="Join" subtitle="The roll" />);
  expect(screen.queryByText("Join")).not.toBeOnTheScreen();
  expect(screen.getByText("Join", { includeHiddenElements: true })).toBeTruthy();
});

test("keeps each line on one line inside the ring", async () => {
  await render(<Stamp title="Suspended" subtitle="No new guests" />);
  for (const text of ["Suspended", "No new guests"]) {
    const line = screen.getByText(text, { includeHiddenElements: true });
    expect(line.props.numberOfLines).toBe(1);
    expect(line.props.adjustsFontSizeToFit).toBe(true);
  }
});
