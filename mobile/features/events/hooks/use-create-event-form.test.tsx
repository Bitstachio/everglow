import { FormField } from "@/components/ui/form-field";
import { render, screen, userEvent, waitFor } from "@testing-library/react-native";
import { Controller } from "react-hook-form";
import { Button, Text, View } from "react-native";
import { useCreateEventForm } from "./use-create-event-form";

const mockMutateAsync = jest.fn();
const mockSuccess = jest.fn();
const eventDate = new Date("2030-06-15T18:30:00.000Z");

jest.mock("../api/mutations", () => ({
  useCreateEventMutation: () => ({ mutateAsync: mockMutateAsync }),
}));

const CreateFormProbe = () => {
  const { form, onSubmit } = useCreateEventForm({ onSuccess: mockSuccess });
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
      <Button title="Create" onPress={onSubmit} disabled={form.formState.isSubmitting} />
    </View>
  );
};

beforeEach(() => {
  mockMutateAsync.mockReset().mockResolvedValue({ id: "created-event" });
  mockSuccess.mockReset();
});

test("submits trimmed values and an ISO date, then resets for another event", async () => {
  await render(<CreateFormProbe />);
  const user = userEvent.setup();
  await user.type(screen.getByPlaceholderText("Title"), "  Meetup  ");
  await user.type(screen.getByPlaceholderText("Description"), "  Bring friends  ");
  await user.press(screen.getByRole("button", { name: "Choose date" }));
  await user.press(screen.getByRole("button", { name: "Create" }));
  await waitFor(() => expect(mockSuccess).toHaveBeenCalledWith({ id: "created-event" }));
  expect(mockMutateAsync).toHaveBeenCalledWith({
    title: "Meetup",
    description: "Bring friends",
    date: eventDate.toISOString(),
  });
  expect(screen.getByPlaceholderText("Title")).toHaveDisplayValue("");
  expect(screen.getByPlaceholderText("Description")).toHaveDisplayValue("");
});

test("allows an omitted description", async () => {
  await render(<CreateFormProbe />);
  const user = userEvent.setup();
  await user.type(screen.getByPlaceholderText("Title"), "Meetup");
  await user.press(screen.getByRole("button", { name: "Create" }));
  await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledWith({ title: "Meetup", date: expect.any(String) }));
});

test("rejects a whitespace-only title", async () => {
  await render(<CreateFormProbe />);
  const user = userEvent.setup();
  await user.type(screen.getByPlaceholderText("Title"), "   ");
  await user.press(screen.getByRole("button", { name: "Create" }));
  expect(await screen.findByText("Event title is required.")).toBeOnTheScreen();
  expect(mockMutateAsync).not.toHaveBeenCalled();
});

test.each([
  ["Title", 101, "Title must be 100 characters or fewer."],
  ["Description", 256, "Description must be 255 characters or fewer."],
] as const)("rejects an overlong %s", async (field, length, message) => {
  await render(<CreateFormProbe />);
  const user = userEvent.setup();
  await user.paste(screen.getByPlaceholderText(field), "a".repeat(length));
  await user.press(screen.getByRole("button", { name: "Create" }));
  expect(await screen.findByText(message)).toBeOnTheScreen();
  expect(mockMutateAsync).not.toHaveBeenCalled();
});

test("rejects an invalid date before ISO conversion", async () => {
  await render(<CreateFormProbe />);
  const user = userEvent.setup();
  await user.type(screen.getByPlaceholderText("Title"), "Meetup");
  await user.press(screen.getByRole("button", { name: "Invalid date" }));
  await user.press(screen.getByRole("button", { name: "Create" }));
  expect(await screen.findByText("Choose a valid event date and time.")).toBeOnTheScreen();
  expect(mockMutateAsync).not.toHaveBeenCalled();
});

test("preserves values after an API failure and allows retry", async () => {
  mockMutateAsync.mockRejectedValueOnce(new Error("Network unavailable"));
  await render(<CreateFormProbe />);
  const user = userEvent.setup();
  await user.type(screen.getByPlaceholderText("Title"), "Meetup");
  await user.press(screen.getByRole("button", { name: "Create" }));
  expect(await screen.findByText("Network unavailable")).toBeOnTheScreen();
  expect(screen.getByPlaceholderText("Title")).toHaveDisplayValue("Meetup");
  expect(mockSuccess).not.toHaveBeenCalled();
  await user.press(screen.getByRole("button", { name: "Create" }));
  await waitFor(() => expect(mockSuccess).toHaveBeenCalledTimes(1));
  expect(screen.queryByText("Network unavailable")).not.toBeOnTheScreen();
});

test("disables submission while the request is pending", async () => {
  mockMutateAsync.mockReturnValue(new Promise(() => {}));
  await render(<CreateFormProbe />);
  const user = userEvent.setup();
  await user.type(screen.getByPlaceholderText("Title"), "Meetup");
  await user.press(screen.getByRole("button", { name: "Create" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Create" })).toBeDisabled());
  await user.press(screen.getByRole("button", { name: "Create" }));
  expect(mockMutateAsync).toHaveBeenCalledTimes(1);
});
