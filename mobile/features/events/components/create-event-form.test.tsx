import { mockColorScheme } from "../testing/native-mocks";
import "../testing/date-picker-mock";
import { fireEvent, render, screen, userEvent } from "@testing-library/react-native";
import { useForm } from "react-hook-form";
import { Platform } from "react-native";
import type { ComponentProps } from "react";
import type { CreateEventValues } from "../types";
import { buildEvent } from "../testing/fixtures";
import { CreateEventForm } from "./create-event-form";

const initialDate = new Date(2030, 5, 15, 18, 30);
const FormProbe = (props: Partial<Omit<ComponentProps<typeof CreateEventForm>, "control">>) => {
  const { control } = useForm<CreateEventValues>({
    defaultValues: { title: "Meetup", description: "Friends", date: initialDate },
  });
  return (
    <CreateEventForm
      control={control}
      isSubmitting={false}
      createdEvent={null}
      onSubmit={jest.fn()}
      handleCopyLink={jest.fn()}
      handleShareLink={jest.fn()}
      handleCreateAnother={jest.fn()}
      handleDone={jest.fn()}
      {...props}
    />
  );
};
const originalOS = Platform.OS;
beforeEach(() => {
  mockColorScheme.mockReturnValue("light");
});
afterEach(() => {
  Platform.OS = originalOS;
});

test.each(["light", "dark"])("renders editable fields and server errors in %s mode", async (theme) => {
  mockColorScheme.mockReturnValue(theme);
  await render(<FormProbe error="Server unavailable" />);
  expect(screen.getByText("Create an Event")).toBeOnTheScreen();
  expect(screen.getByPlaceholderText("Enter event name")).toHaveDisplayValue("Meetup");
  expect(screen.getByPlaceholderText("What's this event about?")).toHaveDisplayValue("Friends");
  expect(screen.getByText("Server unavailable")).toBeOnTheScreen();
  expect(screen.getByText("Sat, Jun 15, 2030")).toBeOnTheScreen();
  expect(screen.getByText("6:30 PM")).toBeOnTheScreen();
});

test.each(["ios", "android"] as const)("date selection preserves time on %s", async (os) => {
  Platform.OS = os;
  await render(<FormProbe />);
  await userEvent.setup().press(screen.getByRole("button", { name: "Choose date" }));
  expect(screen.getByTestId("date-picker")).toHaveProp("display", os === "ios" ? "spinner" : "default");
  expect(screen.getByTestId("date-picker")).toHaveProp("minimumDate", expect.any(Date));
  await fireEvent(screen.getByTestId("date-picker"), "change", { type: "set" }, new Date(2031, 1, 10, 1, 5));
  expect(screen.getByText("Mon, Feb 10, 2031")).toBeOnTheScreen();
  expect(screen.getByText("6:30 PM")).toBeOnTheScreen();
  if (os === "android") expect(screen.queryByTestId("date-picker")).not.toBeOnTheScreen();
  else expect(screen.getByTestId("date-picker")).toBeOnTheScreen();
});

test.each(["ios", "android"] as const)("time selection preserves date on %s", async (os) => {
  Platform.OS = os;
  await render(<FormProbe />);
  await userEvent.setup().press(screen.getByRole("button", { name: "Choose time" }));
  await fireEvent(screen.getByTestId("time-picker"), "change", { type: "set" }, new Date(2031, 1, 10, 9, 45));
  expect(screen.getByText("Sat, Jun 15, 2030")).toBeOnTheScreen();
  expect(screen.getByText("9:45 AM")).toBeOnTheScreen();
  if (os === "android") expect(screen.queryByTestId("time-picker")).not.toBeOnTheScreen();
  else expect(screen.getByTestId("time-picker")).toBeOnTheScreen();
});

test.each(["date", "time"])("dismissed or missing %s values leave the form unchanged", async (mode) => {
  Platform.OS = "android";
  await render(<FormProbe />);
  for (const type of ["dismissed", "set"]) {
    await userEvent.setup().press(screen.getByRole("button", { name: `Choose ${mode}` }));
    await fireEvent(screen.getByTestId(`${mode}-picker`), "change", { type });
    expect(screen.queryByTestId(`${mode}-picker`)).not.toBeOnTheScreen();
    expect(screen.getByText("Sat, Jun 15, 2030")).toBeOnTheScreen();
    expect(screen.getByText("6:30 PM")).toBeOnTheScreen();
  }
});

test("opens only one picker and closes it using the overlay or submit", async () => {
  const onSubmit = jest.fn();
  await render(<FormProbe onSubmit={onSubmit} />);
  const user = userEvent.setup();
  await user.press(screen.getByRole("button", { name: "Choose date" }));
  await user.press(screen.getByRole("button", { name: "Choose time" }));
  expect(screen.queryByTestId("date-picker")).not.toBeOnTheScreen();
  expect(screen.getByTestId("time-picker")).toBeOnTheScreen();
  await user.press(screen.getByRole("button", { name: "Close date and time picker" }));
  expect(screen.queryByTestId("time-picker")).not.toBeOnTheScreen();
  await user.press(screen.getByRole("button", { name: "Choose time" }));
  await user.press(screen.getByRole("button", { name: "Choose date" }));
  expect(screen.queryByTestId("time-picker")).not.toBeOnTheScreen();
  await user.press(screen.getByText("Create Event"));
  expect(screen.queryByTestId("date-picker")).not.toBeOnTheScreen();
  expect(onSubmit).toHaveBeenCalledTimes(1);
});

test("disables text editing and picker controls while submitting", async () => {
  await render(<FormProbe isSubmitting />);
  expect(screen.getByPlaceholderText("Enter event name")).toHaveProp("editable", false);
  expect(screen.getByPlaceholderText("What's this event about?")).toHaveProp("editable", false);
  for (const mode of ["date", "time"]) {
    expect(screen.getByRole("button", { name: `Choose ${mode}` })).toBeDisabled();
    await userEvent.setup().press(screen.getByRole("button", { name: `Choose ${mode}` }));
    expect(screen.queryByTestId(`${mode}-picker`)).not.toBeOnTheScreen();
  }
  expect(screen.queryByText("Create Event")).not.toBeOnTheScreen();
});

test.each(["light", "dark"])("shows the returned event, link and QR in %s mode", async (theme) => {
  mockColorScheme.mockReturnValue(theme);
  const event = buildEvent();
  await render(<FormProbe createdEvent={event} />);
  expect(screen.getByText("Your event is live")).toBeOnTheScreen();
  expect(screen.getByText(event.title)).toBeOnTheScreen();
  await fireEvent(screen.getByTestId("qr-slot"), "layout", { nativeEvent: { layout: { width: 320, height: 240 } } });
  expect(screen.getByLabelText(`QR code: ${event.invitationUrl}`)).toBeOnTheScreen();
  expect(screen.queryByPlaceholderText("Enter event name")).not.toBeOnTheScreen();
});

test("supports missing descriptions and dispatches each success action", async () => {
  const event = buildEvent({ description: null });
  const handleCopyLink = jest.fn(),
    handleShareLink = jest.fn(),
    handleCreateAnother = jest.fn(),
    handleDone = jest.fn();
  await render(
    <FormProbe createdEvent={event} {...{ handleCopyLink, handleShareLink, handleCreateAnother, handleDone }} />,
  );
  const user = userEvent.setup();
  await user.press(screen.getByRole("button", { name: "Copy invitation link" }));
  await user.press(screen.getByText("Share event"));
  await user.press(screen.getByText("Create another"));
  await user.press(screen.getByText("Done"));
  for (const callback of [handleCopyLink, handleShareLink, handleCreateAnother, handleDone])
    expect(callback).toHaveBeenCalledTimes(1);
});
