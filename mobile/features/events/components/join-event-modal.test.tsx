import { mockCameraPermission } from "../testing/native-mocks";
import { fireEvent, render, screen, userEvent } from "@testing-library/react-native";
import { useForm } from "react-hook-form";
import type { ComponentProps } from "react";
import { JoinEventModal } from "./join-event-modal";

const ModalProbe = (props: Partial<Omit<ComponentProps<typeof JoinEventModal>, "control">>) => {
  const { control } = useForm({ defaultValues: { invitationUrl: "" } });
  return (
    <JoinEventModal
      visible
      onClose={jest.fn()}
      onSubmit={jest.fn()}
      onScan={jest.fn()}
      isSubmitting={false}
      {...props}
      control={control}
    />
  );
};
beforeEach(() => mockCameraPermission.mockReturnValue({ granted: true }));

test("hides the form when closed", async () => {
  await render(<ModalProbe visible={false} />);
  expect(screen.queryByText("Join an Event")).not.toBeOnTheScreen();
});

test("wires link submission, keyboard submission, cancel, and native dismissal", async () => {
  const onSubmit = jest.fn();
  const onClose = jest.fn();
  await render(<ModalProbe onSubmit={onSubmit} onClose={onClose} />);
  const user = userEvent.setup();
  await user.paste(screen.getByLabelText("Invitation URL or token"), "invite-token");
  await user.press(screen.getByText("Join with Link"));
  await fireEvent(screen.getByLabelText("Invitation URL or token"), "submitEditing");
  expect(onSubmit).toHaveBeenCalledTimes(2);
  await user.press(screen.getByText("Cancel"));
  // Hardware dismissal has no userEvent equivalent.
  await fireEvent(screen.getByTestId("join-event-modal"), "requestClose");
  expect(onClose).toHaveBeenCalledTimes(2);
});

test("blocks editing, cancellation and scanner opening during submission", async () => {
  const onClose = jest.fn();
  await render(<ModalProbe isSubmitting onClose={onClose} />);
  expect(screen.getByLabelText("Invitation URL or token")).toHaveProp("editable", false);
  expect(screen.getByText("Cancel")).toBeDisabled();
  expect(screen.queryByText("Join with Link")).not.toBeOnTheScreen();
  await userEvent.setup().press(screen.getByText("Cancel"));
  await userEvent.setup().press(screen.getByText("Scan QR Code"));
  expect(onClose).not.toHaveBeenCalled();
  expect(screen.queryByTestId("camera")).not.toBeOnTheScreen();
});

test("forwards scanned data and restores the form", async () => {
  const onScan = jest.fn();
  await render(<ModalProbe onScan={onScan} />);
  await userEvent.setup().press(screen.getByText("Scan QR Code"));
  expect(screen.queryByText("Join an Event")).not.toBeOnTheScreen();
  await fireEvent(screen.getByTestId("camera"), "barcodeScanned", { data: "scanned-token" });
  expect(onScan).toHaveBeenCalledWith("scanned-token");
  expect(screen.getByText("Join an Event")).toBeOnTheScreen();
  expect(screen.queryByTestId("camera")).not.toBeOnTheScreen();
});

test("closing the scanner returns to the form without submitting", async () => {
  const onScan = jest.fn();
  await render(<ModalProbe onScan={onScan} />);
  const user = userEvent.setup();
  await user.press(screen.getByText("Scan QR Code"));
  await user.press(screen.getByRole("button", { name: "Close scanner" }));
  expect(screen.getByText("Join an Event")).toBeOnTheScreen();
  expect(onScan).not.toHaveBeenCalled();
});

test("resets the scanner when the parent closes and reopens", async () => {
  const { rerender } = await render(<ModalProbe />);
  await userEvent.setup().press(screen.getByText("Scan QR Code"));
  await rerender(<ModalProbe visible={false} />);
  await rerender(<ModalProbe visible />);
  expect(screen.getByText("Join an Event")).toBeOnTheScreen();
  expect(screen.queryByTestId("camera")).not.toBeOnTheScreen();
});
