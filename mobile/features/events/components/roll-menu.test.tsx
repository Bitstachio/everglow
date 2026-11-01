import "../testing/native-mocks";
import { renderWithI18n } from "@/testing/render";
import { screen, userEvent } from "@testing-library/react-native";
import { RollMenu } from "./roll-menu";

test("host menu lists the run-the-roll actions without Reports", async () => {
  const onSendEnvelope = jest.fn();
  const onOpenRollCall = jest.fn();
  const onOpenSettings = jest.fn();
  const onCut = jest.fn();
  const onLeave = jest.fn();

  await renderWithI18n(
    <RollMenu
      role="host"
      canOpenSettings
      canCut
      onSendEnvelope={onSendEnvelope}
      onOpenRollCall={onOpenRollCall}
      onOpenSettings={onOpenSettings}
      onCut={onCut}
      onLeave={onLeave}
    />,
  );

  expect(screen.getByRole("button", { name: "Send the envelope" })).toBeOnTheScreen();
  expect(screen.getByRole("button", { name: "Roll call" })).toBeOnTheScreen();
  expect(screen.getByRole("button", { name: "Roll settings" })).toBeOnTheScreen();
  expect(screen.getByRole("button", { name: "Cut the roll now" })).toBeOnTheScreen();
  expect(screen.getByRole("button", { name: "Leave the roll" })).toBeOnTheScreen();
  expect(screen.queryByRole("button", { name: /Reports/ })).not.toBeOnTheScreen();

  const user = userEvent.setup();
  await user.press(screen.getByRole("button", { name: "Send the envelope" }));
  await user.press(screen.getByRole("button", { name: "Cut the roll now" }));
  expect(onSendEnvelope).toHaveBeenCalledTimes(1);
  expect(onCut).toHaveBeenCalledTimes(1);
});

test("guests only get roll call and leave", async () => {
  await renderWithI18n(
    <RollMenu
      role="guest"
      canOpenSettings={false}
      canCut={false}
      onSendEnvelope={jest.fn()}
      onOpenRollCall={jest.fn()}
      onOpenSettings={jest.fn()}
      onCut={jest.fn()}
      onLeave={jest.fn()}
    />,
  );

  expect(screen.getByRole("button", { name: "Roll call" })).toBeOnTheScreen();
  expect(screen.getByRole("button", { name: "Leave the roll" })).toBeOnTheScreen();
  expect(screen.queryByRole("button", { name: "Send the envelope" })).not.toBeOnTheScreen();
  expect(screen.queryByRole("button", { name: "Roll settings" })).not.toBeOnTheScreen();
  expect(screen.queryByRole("button", { name: "Cut the roll now" })).not.toBeOnTheScreen();
});
