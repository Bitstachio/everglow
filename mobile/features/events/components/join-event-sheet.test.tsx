import { fireEvent, render, screen, userEvent } from "@testing-library/react-native";
import type { ComponentProps } from "react";
import { useForm } from "react-hook-form";
import { mockCameraPermission } from "../testing/native-mocks";
import { JoinEventSheet } from "./join-event-sheet";

const SheetProbe = (props: Partial<Omit<ComponentProps<typeof JoinEventSheet>, "control">>) => {
  const { control } = useForm({ defaultValues: { invitationUrl: "" } });
  return (
    <JoinEventSheet
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
  await render(<SheetProbe visible={false} />);
  expect(screen.queryByText("Join an Event")).not.toBeOnTheScreen();
});

test("wires link submission, keyboard submission, and sheet dismissal", async () => {
  const onSubmit = jest.fn();
  const onClose = jest.fn();
  await render(<SheetProbe onSubmit={onSubmit} onClose={onClose} />);
  const user = userEvent.setup();
  await user.paste(screen.getByLabelText("Invitation URL or token"), "invite-token");
  await user.press(screen.getByText("Join with Link"));
  await fireEvent(screen.getByLabelText("Invitation URL or token"), "submitEditing");
  expect(onSubmit).toHaveBeenCalledTimes(2);
  await user.press(screen.getByRole("button", { name: "Close join event" }));
  await user.press(screen.getByRole("button", { name: "Dismiss join event" }));
  expect(onClose).toHaveBeenCalledTimes(2);
});

test("blocks editing, dismissal and scanner opening during submission", async () => {
  const onClose = jest.fn();
  await render(<SheetProbe isSubmitting onClose={onClose} />);
  expect(screen.getByLabelText("Invitation URL or token")).toHaveProp("editable", false);
  expect(screen.queryByText("Join with Link")).not.toBeOnTheScreen();
  await userEvent.setup().press(screen.getByRole("button", { name: "Close join event" }));
  await userEvent.setup().press(screen.getByRole("button", { name: "Dismiss join event" }));
  await userEvent.setup().press(screen.getByText("Scan QR Code"));
  expect(onClose).not.toHaveBeenCalled();
  expect(screen.queryByTestId("camera")).not.toBeOnTheScreen();
});

test("forwards scanned data and restores the form", async () => {
  const onScan = jest.fn();
  await render(<SheetProbe onScan={onScan} />);
  await userEvent.setup().press(screen.getByText("Scan QR Code"));
  expect(screen.queryByText("Join an Event")).not.toBeOnTheScreen();
  await fireEvent(screen.getByTestId("camera"), "barcodeScanned", { data: "scanned-token" });
  expect(onScan).toHaveBeenCalledWith("scanned-token");
  expect(screen.getByText("Join an Event")).toBeOnTheScreen();
  expect(screen.queryByTestId("camera")).not.toBeOnTheScreen();
});

test("closing the scanner returns to the form without submitting", async () => {
  const onScan = jest.fn();
  await render(<SheetProbe onScan={onScan} />);
  const user = userEvent.setup();
  await user.press(screen.getByText("Scan QR Code"));
  await user.press(screen.getByRole("button", { name: "Close scanner" }));
  expect(screen.getByText("Join an Event")).toBeOnTheScreen();
  expect(onScan).not.toHaveBeenCalled();
});

test("resets the scanner when the parent closes and reopens", async () => {
  const { rerender } = await render(<SheetProbe />);
  await userEvent.setup().press(screen.getByText("Scan QR Code"));
  await rerender(<SheetProbe visible={false} />);
  await rerender(<SheetProbe visible />);
  expect(screen.getByText("Join an Event")).toBeOnTheScreen();
  expect(screen.queryByTestId("camera")).not.toBeOnTheScreen();
});
