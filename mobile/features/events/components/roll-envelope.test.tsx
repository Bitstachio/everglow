import { renderWithI18n } from "@/testing/render";
import { screen, userEvent } from "@testing-library/react-native";
import { Text } from "react-native";
import { RollEnvelope } from "./roll-envelope";

// The pencil note's arrow renders already drawn, so no animation runs outside act().
jest.mock("@/hooks/use-reduce-motion", () => ({ useReduceMotion: () => true }));

const roll = {
  title: "Nadia turns 30",
  startsAt: "Sat 7 Nov, 7 pm",
  peopleCount: 18,
  pickUpBy: "14 Nov, then it’s gone",
  accessibilityLabel: "Adds-photos envelope for Nadia turns 30",
};

test("fills the envelope in with the roll", async () => {
  await renderWithI18n(<RollEnvelope {...roll} admits="adds" code={<Text>QR</Text>} />);

  expect(screen.getByLabelText("Adds-photos envelope for Nadia turns 30")).toBeOnTheScreen();
  expect(screen.getByText("Nadia turns 30")).toBeOnTheScreen();
  expect(screen.getByText("Sat 7 Nov, 7 pm")).toBeOnTheScreen();
  expect(screen.getByText("18 people so far")).toBeOnTheScreen();
  expect(screen.getByText("14 Nov, then it’s gone")).toBeOnTheScreen();
  expect(screen.getByText("QR")).toBeOnTheScreen();
});

test("counts one person in the singular", async () => {
  await renderWithI18n(<RollEnvelope {...roll} peopleCount={1} />);
  expect(screen.getByText("1 person so far")).toBeOnTheScreen();
});

test.each(["adds", "view"] as const)("an open %s envelope prints nothing by its code", async (admits) => {
  await renderWithI18n(<RollEnvelope {...roll} admits={admits} code={<Text>QR</Text>} />);
  expect(screen.getByText("QR")).toBeOnTheScreen();
  expect(screen.queryByText("Sealed until you sign in")).not.toBeOnTheScreen();
  expect(screen.queryByText(/admits/i)).not.toBeOnTheScreen();
});

test("a sealed envelope keeps the roll and the code to itself", async () => {
  await renderWithI18n(<RollEnvelope {...roll} admits="adds" sealed code={<Text>QR</Text>} />);

  expect(screen.queryByText("Nadia turns 30")).not.toBeOnTheScreen();
  expect(screen.queryByText("18 people so far")).not.toBeOnTheScreen();
  expect(screen.queryByText("QR")).not.toBeOnTheScreen();
  expect(screen.getByText("Sealed until you sign in")).toBeOnTheScreen();
});

test("puts a stamp over the corner", async () => {
  await renderWithI18n(<RollEnvelope {...roll} stamp={<Text>Loaded</Text>} />);
  expect(screen.getByText("Loaded")).toBeOnTheScreen();
});

test("with onSelect the boxes are radio buttons that pick the envelope", async () => {
  const onSelect = jest.fn();
  await renderWithI18n(<RollEnvelope {...roll} admits="adds" note="they add photos too" onSelect={onSelect} />);

  expect(screen.getByRole("radio", { name: "Adds photos", checked: true })).toBeOnTheScreen();
  await userEvent.setup().press(screen.getByRole("radio", { name: "View only", checked: false }));
  expect(onSelect).toHaveBeenCalledWith("view");
  expect(screen.getByText("they add photos too", { includeHiddenElements: true })).toBeOnTheScreen();
});

test("without onSelect, or sealed, the boxes are only printed", async () => {
  const { rerender } = await renderWithI18n(<RollEnvelope {...roll} admits="adds" />);
  expect(screen.queryByRole("radio")).not.toBeOnTheScreen();

  await rerender(<RollEnvelope {...roll} admits="adds" sealed note="they add photos too" onSelect={jest.fn()} />);
  expect(screen.queryByRole("radio")).not.toBeOnTheScreen();
  expect(screen.queryByText("they add photos too", { includeHiddenElements: true })).not.toBeOnTheScreen();
});
