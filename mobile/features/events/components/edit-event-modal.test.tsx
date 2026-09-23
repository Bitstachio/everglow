import { mockColorScheme } from "../testing/native-mocks";
import "../testing/date-picker-mock";
import { fireEvent, render, screen, userEvent } from "@testing-library/react-native";
import { useForm } from "react-hook-form";
import { EditEventModal } from "./edit-event-modal";
import type { EditEventValues } from "../types";

const onSubmit = jest.fn();
const onClose = jest.fn();

const FormProbe = ({
  defaults = { title: "Weekend meetup", description: "An afternoon with friends", date: new Date(2026, 8, 20, 15, 30) },
  isSubmitting = false,
  error,
}: {
  defaults?: EditEventValues;
  isSubmitting?: boolean;
  error?: string;
}) => {
  const form = useForm<EditEventValues>({ defaultValues: defaults });
  return (
    <EditEventModal
      visible
      control={form.control}
      isSubmitting={isSubmitting}
      error={error}
      onSubmit={onSubmit}
      onClose={onClose}
    />
  );
};

beforeEach(() => {
  mockColorScheme.mockReturnValue("light");
  onSubmit.mockReset();
  onClose.mockReset();
});

test("renders seeded values and submits when Save is pressed", async () => {
  await render(<FormProbe />);
  expect(screen.getByPlaceholderText("Enter event title")).toHaveDisplayValue("Weekend meetup");
  expect(screen.getByPlaceholderText("Enter event description")).toHaveDisplayValue("An afternoon with friends");
  await userEvent.setup().press(screen.getByText("Save Changes"));
  expect(onSubmit).toHaveBeenCalledTimes(1);
});

test("fills fields with paste and still submits", async () => {
  await render(<FormProbe defaults={{ title: "", description: "", date: new Date(2026, 8, 20) }} />);
  const user = userEvent.setup();
  await user.paste(screen.getByPlaceholderText("Enter event title"), "Picnic");
  await user.paste(screen.getByPlaceholderText("Enter event description"), "Bring snacks");
  expect(screen.getByPlaceholderText("Enter event title")).toHaveDisplayValue("Picnic");
  expect(screen.getByPlaceholderText("Enter event description")).toHaveDisplayValue("Bring snacks");
  await user.press(screen.getByText("Save Changes"));
  expect(onSubmit).toHaveBeenCalledTimes(1);
});

test("opens date and time pickers and applies changes", async () => {
  await render(<FormProbe />);
  const user = userEvent.setup();
  await user.press(screen.getByRole("button", { name: "Choose date" }));
  expect(screen.getByTestId("date-picker")).toBeOnTheScreen();
  await fireEvent(screen.getByTestId("date-picker"), "change", { type: "set" }, new Date(2031, 1, 10));
  await user.press(screen.getByRole("button", { name: "Choose time" }));
  expect(screen.getByTestId("time-picker")).toBeOnTheScreen();
  await fireEvent(screen.getByTestId("time-picker"), "change", { type: "set" }, new Date(2030, 0, 1, 9, 45));
  await user.press(screen.getByText("Save Changes"));
  expect(onSubmit).toHaveBeenCalledTimes(1);
});

test("Cancel closes while loading locks controls", async () => {
  const view = await render(<FormProbe />);
  await userEvent.setup().press(screen.getByText("Cancel"));
  expect(onClose).toHaveBeenCalledTimes(1);

  await view.rerender(<FormProbe isSubmitting />);
  expect(screen.getByPlaceholderText("Enter event title")).toHaveProp("editable", false);
  expect(screen.queryByText("Save Changes")).not.toBeOnTheScreen();
  await userEvent.setup().press(screen.getByText("Cancel"));
  expect(onClose).toHaveBeenCalledTimes(1);
});

test("shows a server error message", async () => {
  await render(<FormProbe error="Network unavailable" />);
  expect(screen.getByText("Network unavailable")).toBeOnTheScreen();
});
