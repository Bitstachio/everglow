import "../testing/native-mocks";
import { renderWithI18n } from "@/testing/render";
import { screen, userEvent } from "@testing-library/react-native";
import { RollMenu } from "./roll-menu";

const handlers = () => ({
  onSendEnvelope: jest.fn(),
  onOpenRollCall: jest.fn(),
  onOpenSettings: jest.fn(),
  onCut: jest.fn(),
  onReportRoll: jest.fn(),
  onLeave: jest.fn(),
});

test("a host runs the roll from the menu", async () => {
  const on = handlers();
  await renderWithI18n(<RollMenu role="host" canOpenSettings canCut {...on} />);

  expect(screen.getByRole("button", { name: "Send the envelope" })).toBeOnTheScreen();
  expect(screen.getByRole("button", { name: "Roll call" })).toBeOnTheScreen();
  expect(screen.getByRole("button", { name: "Roll settings" })).toBeOnTheScreen();
  expect(screen.getByRole("button", { name: "Cut the roll now" })).toBeOnTheScreen();
  expect(screen.getByRole("button", { name: "Leave the roll" })).toBeOnTheScreen();
  expect(screen.queryByRole("button", { name: /Reports/ })).not.toBeOnTheScreen();
  expect(screen.queryByRole("button", { name: "Report this roll" })).not.toBeOnTheScreen();

  const user = userEvent.setup();
  await user.press(screen.getByRole("button", { name: "Send the envelope" }));
  await user.press(screen.getByRole("button", { name: "Cut the roll now" }));
  expect(on.onSendEnvelope).toHaveBeenCalledTimes(1);
  expect(on.onCut).toHaveBeenCalledTimes(1);
});

test("a host who can review reports sees how many wait", async () => {
  const onOpen = jest.fn();
  await renderWithI18n(
    <RollMenu role="host" canOpenSettings canCut reports={{ toCheck: 2, onOpen }} {...handlers()} />,
  );

  await userEvent.setup().press(screen.getByRole("button", { name: "Reports · 2 to check" }));
  expect(onOpen).toHaveBeenCalledTimes(1);
});

test("with nothing to check the row just says Reports", async () => {
  await renderWithI18n(
    <RollMenu role="host" canOpenSettings canCut reports={{ toCheck: 0, onOpen: jest.fn() }} {...handlers()} />,
  );
  expect(screen.getByRole("button", { name: "Reports" })).toBeOnTheScreen();
});

test("settings and cut leave the menu when they don't apply", async () => {
  await renderWithI18n(<RollMenu role="host" canOpenSettings={false} canCut={false} {...handlers()} />);
  expect(screen.queryByRole("button", { name: "Roll settings" })).not.toBeOnTheScreen();
  expect(screen.queryByRole("button", { name: "Cut the roll now" })).not.toBeOnTheScreen();
});

test("a closed roll's host deletes it in Cut's place", async () => {
  const onDelete = jest.fn();
  await renderWithI18n(
    <RollMenu role="host" canOpenSettings canCut={false} canDelete onDelete={onDelete} {...handlers()} />,
  );

  expect(screen.queryByRole("button", { name: "Cut the roll now" })).not.toBeOnTheScreen();
  expect(screen.getByRole("button", { name: "Leave the roll" })).toBeOnTheScreen();
  await userEvent.setup().press(screen.getByRole("button", { name: "Delete the roll" }));
  expect(onDelete).toHaveBeenCalledTimes(1);
});

test("Leave goes when it can't apply", async () => {
  await renderWithI18n(
    <RollMenu
      role="host"
      canOpenSettings
      canCut={false}
      canDelete
      canLeave={false}
      onDelete={jest.fn()}
      {...handlers()}
    />,
  );
  expect(screen.getByRole("button", { name: "Delete the roll" })).toBeOnTheScreen();
  expect(screen.queryByRole("button", { name: "Leave the roll" })).not.toBeOnTheScreen();
});

test("a guest gets the roll call, a report and leave", async () => {
  const on = handlers();
  await renderWithI18n(<RollMenu role="guest" canOpenSettings={false} canCut={false} {...on} />);

  expect(screen.getByRole("button", { name: "Roll call" })).toBeOnTheScreen();
  expect(screen.getByRole("button", { name: "Leave the roll" })).toBeOnTheScreen();
  expect(screen.queryByRole("button", { name: "Send the envelope" })).not.toBeOnTheScreen();
  expect(screen.queryByRole("button", { name: "Roll settings" })).not.toBeOnTheScreen();
  expect(screen.queryByRole("button", { name: "Cut the roll now" })).not.toBeOnTheScreen();

  await userEvent.setup().press(screen.getByRole("button", { name: "Report this roll" }));
  expect(on.onReportRoll).toHaveBeenCalledTimes(1);
});
