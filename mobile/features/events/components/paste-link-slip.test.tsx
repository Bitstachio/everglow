import { fireEvent, render, screen } from "@testing-library/react-native";
import { PasteLinkSlip } from "./paste-link-slip";

const props = {
  edge: "Paste a link",
  title: "From a message?",
  label: "Invite link",
  placeholder: "everglow.social/join/…",
  openLabel: "Open the envelope",
  onChangeText: jest.fn(),
};

test("opens from the keyboard's Go once there is a link", async () => {
  const onOpen = jest.fn();
  await render(<PasteLinkSlip {...props} value="everglow.social/join/k8Qm2" canOpen onOpen={onOpen} />);

  await fireEvent(screen.getByLabelText("Invite link"), "submitEditing");

  expect(onOpen).toHaveBeenCalledTimes(1);
});

test("doesn't open from the keyboard without one", async () => {
  const onOpen = jest.fn();
  await render(<PasteLinkSlip {...props} value="" canOpen={false} onOpen={onOpen} />);

  await fireEvent(screen.getByLabelText("Invite link"), "submitEditing");

  expect(onOpen).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Open the envelope" })).toBeDisabled();
});
