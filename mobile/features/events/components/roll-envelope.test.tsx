import { Stamp } from "@/components/ui/stamp";
import { renderWithI18n } from "@/testing/render";
import { screen } from "@testing-library/react-native";
import { Text } from "react-native";
import { RollEnvelope } from "./roll-envelope";

test("fills the envelope in with the roll", async () => {
  await renderWithI18n(
    <RollEnvelope
      title="Nadia turns 30"
      startsAt="Sat 7 Nov, 7 pm"
      peopleCount={1}
      pickUpBy="14 Nov"
      admits="adds"
      code={<Text>QR</Text>}
      stamp={<Stamp title="Loaded" />}
      accessibilityLabel="Envelope for Nadia turns 30"
    />,
  );

  expect(screen.getByLabelText("Envelope for Nadia turns 30")).toBeOnTheScreen();
  for (const text of [
    "Everglow photo lab",
    "Nadia turns 30",
    "Sat 7 Nov, 7 pm",
    "Just you so far",
    "14 Nov, then it’s gone",
    "Adds photos",
    "View only",
    "Scan with any camera",
    "QR",
  ]) {
    expect(screen.getByText(text)).toBeOnTheScreen();
  }
  // The stamp repeats the screen's words, so assistive tech skips it.
  expect(screen.getByText("Loaded", { includeHiddenElements: true })).toBeOnTheScreen();
});

test("counts everyone on the roll, and leaves a sealed envelope blank", async () => {
  const { rerender } = await renderWithI18n(
    <RollEnvelope title="Nadia turns 30" peopleCount={12} admits="view" accessibilityLabel="Envelope" />,
  );
  expect(screen.getByText("12 people so far")).toBeOnTheScreen();
  expect(screen.queryByText("Scan with any camera")).not.toBeOnTheScreen();

  await rerender(<RollEnvelope title="Nadia turns 30" peopleCount={12} sealed accessibilityLabel="Envelope" />);
  expect(screen.queryByText("Nadia turns 30")).not.toBeOnTheScreen();
  expect(screen.queryByText("12 people so far")).not.toBeOnTheScreen();
  expect(screen.getByText("On the roll")).toBeOnTheScreen();
  expect(screen.queryByText("Adds photos")).not.toBeOnTheScreen();
});
