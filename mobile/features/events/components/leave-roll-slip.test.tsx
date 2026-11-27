import { renderWithI18n } from "@/testing/render";
import { screen, userEvent } from "@testing-library/react-native";
import { LeaveRollSlip } from "./leave-roll-slip";

const props = {
  rollTitle: "Sam & Jo’s wedding",
  frameCount: 12,
  closed: false,
  photos: "KEEP" as const,
  error: null,
  isLeaving: false,
  onChoose: jest.fn(),
  onConfirm: jest.fn(),
  onStay: jest.fn(),
};

beforeEach(() => jest.clearAllMocks());

test("asks what happens to the frames you added, with leaving them selected", async () => {
  await renderWithI18n(<LeaveRollSlip {...props} />);

  expect(screen.getByText("Leave Sam & Jo’s wedding")).toBeOnTheScreen();
  expect(screen.getByRole("header", { name: "What about your 12 photos?" })).toBeOnTheScreen();
  expect(screen.getByRole("radio", { name: /Leave them in the event/, checked: true })).toBeOnTheScreen();
  expect(screen.getByRole("radio", { name: /Take them with me/, checked: false })).toBeOnTheScreen();
  expect(screen.getByText("All 12 are removed for everyone. This can’t be undone.")).toBeOnTheScreen();
  expect(screen.getByText("To come back you’ll need a new envelope.")).toBeOnTheScreen();

  const user = userEvent.setup();
  await user.press(screen.getByRole("radio", { name: /Take them with me/ }));
  expect(props.onChoose).toHaveBeenCalledWith("DELETE");
  await user.press(screen.getByRole("button", { name: "Stay" }));
  expect(props.onStay).toHaveBeenCalledTimes(1);
  expect(props.onConfirm).not.toHaveBeenCalled();
});

test("says which frames go in words that fit the count", async () => {
  const view = await renderWithI18n(<LeaveRollSlip {...props} frameCount={1} />);
  expect(screen.getByRole("header", { name: "What about your photo?" })).toBeOnTheScreen();
  expect(
    screen.getByRole("radio", { name: "Leave it in the event. Everyone keeps it until the event closes" }),
  ).toBeOnTheScreen();
  expect(screen.getByRole("radio", { name: /^Take it with me/ })).toBeOnTheScreen();
  expect(screen.getByText("It’s removed for everyone. This can’t be undone.")).toBeOnTheScreen();

  await view.rerender(<LeaveRollSlip {...props} frameCount={2} />);
  expect(screen.getByRole("header", { name: "What about your 2 photos?" })).toBeOnTheScreen();
  expect(screen.getByText("Both are removed for everyone. This can’t be undone.")).toBeOnTheScreen();
});

test("a roll with no frames of yours, or a closed roll, does not ask", async () => {
  const view = await renderWithI18n(<LeaveRollSlip {...props} frameCount={0} />);
  expect(screen.getByRole("header", { name: "Leave Sam & Jo’s wedding?" })).toBeOnTheScreen();
  expect(screen.queryByRole("radio")).not.toBeOnTheScreen();
  expect(screen.getByText("To come back you’ll need a new envelope.")).toBeOnTheScreen();

  await view.rerender(<LeaveRollSlip {...props} closed frameCount={12} />);
  expect(screen.getByText("It has closed, so you can’t join it again.")).toBeOnTheScreen();
  expect(screen.queryByRole("radio")).not.toBeOnTheScreen();
});

test("a refusal stays on the slip with the choice you made", async () => {
  await renderWithI18n(
    <LeaveRollSlip {...props} photos="DELETE" error="Every event needs an organizer. Make someone else an organizer first." />,
  );
  expect(screen.getByRole("alert")).toHaveTextContent("Every event needs an organizer. Make someone else an organizer first.");
  expect(screen.getByRole("radio", { name: /Take them with me/, checked: true })).toBeOnTheScreen();
});
