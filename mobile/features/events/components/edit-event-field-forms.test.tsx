import { mockColorScheme } from "../testing/native-mocks";
import "../testing/date-picker-mock";
import { fireEvent, render, screen, userEvent } from "@testing-library/react-native";
import { useForm } from "react-hook-form";
import type { EditEventDateValues, EditEventTitleValues } from "../types";
import { EditEventDateForm } from "./edit-event-date-form";
import { EditEventTitleForm } from "./edit-event-title-form";

const onSubmit = jest.fn();

beforeEach(() => {
  mockColorScheme.mockReturnValue("light");
  onSubmit.mockReset();
});

const TitleProbe = ({
  defaults = { title: "Weekend meetup" },
  isSubmitting = false,
  error,
}: {
  defaults?: EditEventTitleValues;
  isSubmitting?: boolean;
  error?: string;
}) => {
  const form = useForm<EditEventTitleValues>({ defaultValues: defaults });
  return (
    <EditEventTitleForm
      control={form.control}
      isDirty={form.formState.isDirty}
      isSubmitting={isSubmitting}
      error={error}
      onSubmit={onSubmit}
    />
  );
};

const DateProbe = ({
  defaults = { date: new Date(2026, 8, 20, 15, 30) },
  isSubmitting = false,
}: {
  defaults?: EditEventDateValues;
  isSubmitting?: boolean;
}) => {
  const form = useForm<EditEventDateValues>({ defaultValues: defaults });
  return <EditEventDateForm control={form.control} isDirty isSubmitting={isSubmitting} onSubmit={onSubmit} />;
};

test("title form renders the seeded value and submits when dirty", async () => {
  await render(<TitleProbe />);
  expect(screen.getByPlaceholderText("Enter event title")).toHaveDisplayValue("Weekend meetup");
  expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  await userEvent.setup().paste(screen.getByPlaceholderText("Enter event title"), "Picnic");
  await userEvent.setup().press(screen.getByRole("button", { name: "Save" }));
  expect(onSubmit).toHaveBeenCalledTimes(1);
});

test("title form shows a server error", async () => {
  await render(<TitleProbe error="Network unavailable" />);
  expect(screen.getByText("Network unavailable")).toBeOnTheScreen();
});

test("date form opens pickers and submits", async () => {
  await render(<DateProbe />);
  const user = userEvent.setup();
  await user.press(screen.getByRole("button", { name: "Choose date" }));
  expect(screen.getByTestId("date-picker")).toBeOnTheScreen();
  await fireEvent(screen.getByTestId("date-picker"), "change", { type: "set" }, new Date(2031, 1, 10));
  await user.press(screen.getByRole("button", { name: "Choose time" }));
  expect(screen.getByTestId("time-picker")).toBeOnTheScreen();
  await user.press(screen.getByText("Save"));
  expect(onSubmit).toHaveBeenCalledTimes(1);
});
