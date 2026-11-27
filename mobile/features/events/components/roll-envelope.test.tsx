import { renderWithI18n } from "@/testing/render";
import { screen, userEvent } from "@testing-library/react-native";
import { Text } from "react-native";
import { RollEnvelope } from "./roll-envelope";

// The pencil note's arrow renders already drawn, so no animation runs outside act().
jest.mock("@/hooks/use-reduce-motion", () => ({ useReduceMotion: () => true }));

const roll = {
  title: "Nadia turns 30",
  startsAt: "Sat, 7 Nov, 19:00",
  pickUpBy: "Sat, 14 Nov, 19:00",
  accessibilityLabel: "Participant envelope for Nadia turns 30",
};

test("fills the envelope in with the roll", async () => {
  await renderWithI18n(<RollEnvelope {...roll} admits="participant" code={<Text>QR</Text>} />);

  expect(screen.getByLabelText("Participant envelope for Nadia turns 30")).toBeOnTheScreen();
  expect(screen.getByText("Nadia turns 30")).toBeOnTheScreen();
  expect(screen.getByText("Sat, 7 Nov, 19:00")).toBeOnTheScreen();
  expect(screen.getByText("Sat, 14 Nov, 19:00")).toBeOnTheScreen();
  expect(screen.getByText("QR")).toBeOnTheScreen();
});

test.each(["participant", "viewer"] as const)("an open %s envelope prints nothing by its code", async (admits) => {
  await renderWithI18n(<RollEnvelope {...roll} admits={admits} code={<Text>QR</Text>} />);
  expect(screen.getByText("QR")).toBeOnTheScreen();
  expect(screen.queryByText(/admits/i)).not.toBeOnTheScreen();
});

test("a sealed envelope keeps the roll and the code to itself", async () => {
  await renderWithI18n(<RollEnvelope {...roll} admits="participant" sealed code={<Text>QR</Text>} />);

  expect(screen.queryByText("Nadia turns 30")).not.toBeOnTheScreen();
  expect(screen.queryByText("Sat, 7 Nov, 19:00")).not.toBeOnTheScreen();
  expect(screen.queryByText("QR")).not.toBeOnTheScreen();
});

test("puts a stamp over the corner", async () => {
  await renderWithI18n(<RollEnvelope {...roll} stamp={<Text>Loaded</Text>} />);
  expect(screen.getByText("Loaded")).toBeOnTheScreen();
});

test("with onSelect the boxes are radio buttons that pick the envelope", async () => {
  const onSelect = jest.fn();
  await renderWithI18n(<RollEnvelope {...roll} admits="participant" note="they add photos too" onSelect={onSelect} />);

  expect(screen.getByRole("radio", { name: "Participant", checked: true })).toBeOnTheScreen();
  await userEvent.setup().press(screen.getByRole("radio", { name: "Viewer", checked: false }));
  expect(onSelect).toHaveBeenCalledWith("viewer");
  expect(screen.getByText("they add photos too", { includeHiddenElements: true })).toBeOnTheScreen();
});

test("without onSelect, or sealed, the boxes are only printed", async () => {
  const { rerender } = await renderWithI18n(<RollEnvelope {...roll} admits="participant" />);
  expect(screen.queryByRole("radio")).not.toBeOnTheScreen();

  await rerender(
    <RollEnvelope {...roll} admits="participant" sealed note="they add photos too" onSelect={jest.fn()} />,
  );
  expect(screen.queryByRole("radio")).not.toBeOnTheScreen();
  expect(screen.queryByText("they add photos too", { includeHiddenElements: true })).not.toBeOnTheScreen();
});
