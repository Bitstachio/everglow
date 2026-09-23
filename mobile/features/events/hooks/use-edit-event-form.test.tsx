import { FormField } from "@/components/ui/form-field";
import { render, screen, userEvent, waitFor } from "@testing-library/react-native";
import { Controller } from "react-hook-form";
import { Button, Text, View } from "react-native";
import { buildEvent, deferred } from "../testing/fixtures";
import { useEditEventForm } from "./use-edit-event-form";

const mockMutateAsync = jest.fn();
const mockSuccess = jest.fn();
const eventDate = new Date("2030-06-15T18:30:00.000Z");
const seededEvent = buildEvent();

jest.mock("../api/mutations", () => ({
  useUpdateEventMutation: () => ({ mutateAsync: mockMutateAsync }),
}));

const EditFormProbe = () => {
  const { form, onSubmit } = useEditEventForm({
    eventId: "event-1",
    event: seededEvent,
    onSuccess: mockSuccess,
  });
  return (
    <View>
      <FormField control={form.control} name="title" placeholder="Title" />
      <FormField control={form.control} name="description" placeholder="Description" />
      <Controller
        control={form.control}
        name="date"
        render={({ field, fieldState }) => (
          <View>
            <Button title="Choose date" onPress={() => field.onChange(eventDate)} />
            <Button title="Invalid date" onPress={() => field.onChange(new Date(NaN))} />
            {fieldState.error && <Text>{fieldState.error.message}</Text>}
          </View>
        )}
      />
      {form.formState.errors.root?.server && <Text>{form.formState.errors.root.server.message}</Text>}
      <Button title="Save again" onPress={onSubmit} />
      <Button title="Save" onPress={onSubmit} disabled={form.formState.isSubmitting} />
    </View>
  );
};

beforeEach(() => {
  mockMutateAsync.mockReset().mockResolvedValue(buildEvent({ title: "Updated meetup" }));
  mockSuccess.mockReset();
});

test("submits trimmed values and clears an empty description to null", async () => {
  await render(<EditFormProbe />);
  const user = userEvent.setup();
  await user.paste(screen.getByPlaceholderText("Title"), "  Updated meetup  ");
  await user.paste(screen.getByPlaceholderText("Description"), "   ");
  await user.press(screen.getByRole("button", { name: "Choose date" }));
  await user.press(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(mockSuccess).toHaveBeenCalledTimes(1));
  expect(mockMutateAsync).toHaveBeenCalledWith({
    title: "Updated meetup",
    description: null,
    date: eventDate.toISOString(),
  });
});

test("rejects a whitespace-only title", async () => {
  await render(<EditFormProbe />);
  const user = userEvent.setup();
  await user.paste(screen.getByPlaceholderText("Title"), "   ");
  await user.press(screen.getByRole("button", { name: "Save" }));
  expect(await screen.findByText("Event title is required.")).toBeOnTheScreen();
  expect(mockMutateAsync).not.toHaveBeenCalled();
});

test("surfaces server errors and keeps values for retry", async () => {
  mockMutateAsync.mockRejectedValueOnce(new Error("Network unavailable"));
  await render(<EditFormProbe />);
  const user = userEvent.setup();
  await user.paste(screen.getByPlaceholderText("Title"), "Retry title");
  await user.press(screen.getByRole("button", { name: "Save" }));
  expect(await screen.findByText("Network unavailable")).toBeOnTheScreen();
  expect(screen.getByPlaceholderText("Title")).toHaveDisplayValue("Retry title");
  expect(mockSuccess).not.toHaveBeenCalled();
  await user.press(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(mockSuccess).toHaveBeenCalledTimes(1));
  expect(mockMutateAsync).toHaveBeenCalledTimes(2);
});

test("locks submit while the mutation is pending", async () => {
  const pending = deferred<unknown>();
  mockMutateAsync.mockReturnValue(pending.promise);
  await render(<EditFormProbe />);
  const user = userEvent.setup();
  await user.paste(screen.getByPlaceholderText("Title"), "Meetup");
  await user.press(screen.getByRole("button", { name: "Save" }));
  expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  await user.press(screen.getByRole("button", { name: "Save again" }));
  expect(mockMutateAsync).toHaveBeenCalledTimes(1);
  pending.resolve(buildEvent());
  await waitFor(() => expect(mockSuccess).toHaveBeenCalledTimes(1));
});

test("rejects an invalid date", async () => {
  await render(<EditFormProbe />);
  const user = userEvent.setup();
  await user.press(screen.getByRole("button", { name: "Invalid date" }));
  await user.press(screen.getByRole("button", { name: "Save" }));
  expect(await screen.findByText("Choose a valid event date and time.")).toBeOnTheScreen();
  expect(mockMutateAsync).not.toHaveBeenCalled();
});
