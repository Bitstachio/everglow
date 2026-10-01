import { FormField } from "@/components/ui/form-field";
import { render, screen, userEvent, waitFor } from "@testing-library/react-native";
import { Button, Text, View } from "react-native";
import { buildEvent, deferred } from "../testing/fixtures";
import { useEditEventTitleForm } from "./use-edit-event-title-form";

const mockMutateAsync = jest.fn();
const mockSuccess = jest.fn();

jest.mock("../api/mutations", () => ({
  useUpdateEventMutation: () => ({ mutateAsync: mockMutateAsync }),
}));

const TitleFormProbe = ({ initialTitle = "Weekend meetup" }: { initialTitle?: string }) => {
  const { form, onSubmit } = useEditEventTitleForm({
    eventId: "event-1",
    initialTitle,
    onSuccess: mockSuccess,
  });
  return (
    <View>
      <FormField control={form.control} name="title" placeholder="Title" />
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

test("submits a trimmed title", async () => {
  await render(<TitleFormProbe />);
  const user = userEvent.setup();
  await user.paste(screen.getByPlaceholderText("Title"), "  Updated meetup  ");
  await user.press(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(mockSuccess).toHaveBeenCalledTimes(1));
  expect(mockMutateAsync).toHaveBeenCalledWith({ title: "Updated meetup" });
});

test("rejects a whitespace-only title", async () => {
  await render(<TitleFormProbe />);
  const user = userEvent.setup();
  await user.paste(screen.getByPlaceholderText("Title"), "   ");
  await user.press(screen.getByRole("button", { name: "Save" }));
  expect(await screen.findByText("Event title is required.")).toBeOnTheScreen();
  expect(mockMutateAsync).not.toHaveBeenCalled();
});

test("surfaces server errors and keeps values for retry", async () => {
  mockMutateAsync.mockRejectedValueOnce(new Error("Network unavailable"));
  await render(<TitleFormProbe />);
  const user = userEvent.setup();
  await user.paste(screen.getByPlaceholderText("Title"), "Retry title");
  await user.press(screen.getByRole("button", { name: "Save" }));
  expect(await screen.findByText("Failed to update event title")).toBeOnTheScreen();
  expect(screen.getByPlaceholderText("Title")).toHaveDisplayValue("Retry title");
  expect(mockSuccess).not.toHaveBeenCalled();
  await user.press(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(mockSuccess).toHaveBeenCalledTimes(1));
  expect(mockMutateAsync).toHaveBeenCalledTimes(2);
});

test("locks submit while the mutation is pending", async () => {
  const pending = deferred<unknown>();
  mockMutateAsync.mockReturnValue(pending.promise);
  await render(<TitleFormProbe />);
  const user = userEvent.setup();
  await user.paste(screen.getByPlaceholderText("Title"), "Meetup");
  await user.press(screen.getByRole("button", { name: "Save" }));
  expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  await user.press(screen.getByRole("button", { name: "Save again" }));
  expect(mockMutateAsync).toHaveBeenCalledTimes(1);
  pending.resolve(buildEvent());
  await waitFor(() => expect(mockSuccess).toHaveBeenCalledTimes(1));
});

test("skips the mutation when the title is unchanged", async () => {
  await render(<TitleFormProbe />);
  await userEvent.setup().press(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(mockSuccess).toHaveBeenCalledTimes(1));
  expect(mockMutateAsync).not.toHaveBeenCalled();
});
