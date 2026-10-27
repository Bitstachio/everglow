import { fireEvent, render, screen, userEvent } from "@testing-library/react-native";
import { LabEnvelope } from "./lab-envelope";
import { PaperButton } from "./lab-paper";

// The pencil arrow renders already drawn, so no animation runs outside act().
jest.mock("@/hooks/use-reduce-motion", () => ({ useReduceMotion: () => true }));

test("reads as one summary and prints the filled-in fields", async () => {
  await render(
    <LabEnvelope
      fields={[{ label: "Name", value: "Sam & Jo’s wedding" }]}
      options={[{ label: "Adds photos", checked: true }]}
      accessibilityLabel="Invite to Sam and Jo’s wedding"
    />,
  );
  expect(screen.getByLabelText("Invite to Sam and Jo’s wedding")).toBeOnTheScreen();
  expect(screen.getByText("Sam & Jo’s wedding")).toBeOnTheScreen();
  expect(screen.getByText("Adds photos")).toBeOnTheScreen();
});

test("a sealed envelope leaves its fields blank", async () => {
  await render(<LabEnvelope fields={[{ label: "Name" }]} accessibilityLabel="Invite" />);
  expect(screen.getByText("Name")).toBeOnTheScreen();
});

test("the note's arrow follows the ticked box", async () => {
  const envelope = (adds: boolean) => (
    <LabEnvelope
      fields={[{ label: "Name", value: "Test" }]}
      options={[
        { label: "Adds photos", checked: adds, onPress: jest.fn() },
        { label: "View only", checked: !adds, onPress: jest.fn() },
      ]}
      note="a note"
      accessibilityLabel="Invite"
    />
  );
  const { rerender } = await render(envelope(true));
  const layoutAt = (x: number) => ({ nativeEvent: { layout: { x, y: 0, width: 120, height: 44 } } });
  await fireEvent(screen.getByRole("radio", { name: "Adds photos" }), "layout", layoutAt(0));
  await fireEvent(screen.getByRole("radio", { name: "View only" }), "layout", layoutAt(136));
  expect(screen.getByTestId("envelope-note", { includeHiddenElements: true })).toHaveStyle({ marginLeft: 0 });

  // Ticking the other box moves no box, so no new layout comes: the arrow must still move.
  await rerender(envelope(false));
  expect(screen.getByTestId("envelope-note", { includeHiddenElements: true })).toHaveStyle({ marginLeft: 136 });
});

test("a printed action at the foot of the paper is a button", async () => {
  const onPress = jest.fn();
  await render(
    <LabEnvelope
      fields={[{ label: "Name", value: "Test" }]}
      action={<PaperButton title="Share the link" mark="↗" onPress={onPress} />}
      accessibilityLabel="Invite"
    />,
  );
  await userEvent.setup().press(screen.getByRole("button", { name: "Share the link" }));
  expect(onPress).toHaveBeenCalledTimes(1);
});
