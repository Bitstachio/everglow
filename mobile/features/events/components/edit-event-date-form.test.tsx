import "../testing/native-mocks";
import "../testing/date-picker-mock";
import { fireEvent, render, screen, userEvent } from "@testing-library/react-native";
import { useForm } from "react-hook-form";
import type { EditEventDateValues } from "../types";
import { EditEventDateForm } from "./edit-event-date-form";

const onSubmit = jest.fn();

beforeEach(() => {
  onSubmit.mockReset();
});

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
