import { render, screen, userEvent, waitFor } from "@testing-library/react-native";
import { SettingsTextEdit } from "@/components/ui/settings-text-edit";
import { Controller } from "react-hook-form";
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
    <Controller
      control={form.control}
      name="title"
      render={({ field, fieldState }) => (
        <SettingsTextEdit
          value={field.value}
          onChangeText={field.onChange}
          onBlur={field.onBlur}
          onSubmitEditing={onSubmit}
          placeholder="Name your roll"
          accessibilityLabel="Roll name"
          hint="This is the name people see on the roll and on the envelope."
          error={fieldState.error?.message ?? form.formState.errors.root?.server?.message}
          saveLabel="Save"
          onSave={onSubmit}
          isDirty={form.formState.isDirty}
          isSubmitting={form.formState.isSubmitting}
          autoCapitalize="sentences"
          maxLength={100}
        />
      )}
    />
  );
};

beforeEach(() => {
  mockMutateAsync.mockReset().mockResolvedValue(buildEvent({ title: "Updated meetup" }));
  mockSuccess.mockReset();
});

test("submits a trimmed title", async () => {
  await render(<TitleFormProbe />);
  const user = userEvent.setup();
  await user.paste(screen.getByLabelText("Roll name"), "  Updated meetup  ");
  await user.press(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(mockSuccess).toHaveBeenCalledTimes(1));
  expect(mockMutateAsync).toHaveBeenCalledWith({ title: "Updated meetup" });
});

test("rejects a whitespace-only title", async () => {
  await render(<TitleFormProbe />);
  const user = userEvent.setup();
  await user.paste(screen.getByLabelText("Roll name"), "   ");
  await user.press(screen.getByRole("button", { name: "Save" }));
  expect(await screen.findByText("Give the roll a name")).toBeOnTheScreen();
  expect(mockMutateAsync).not.toHaveBeenCalled();
});

test("surfaces server errors and keeps values for retry", async () => {
  mockMutateAsync.mockRejectedValueOnce(new Error("Network unavailable"));
  await render(<TitleFormProbe />);
  const user = userEvent.setup();
  await user.paste(screen.getByLabelText("Roll name"), "Retry title");
  await user.press(screen.getByRole("button", { name: "Save" }));
  expect(await screen.findByText("Couldn’t update the name. Try again.")).toBeOnTheScreen();
  expect(screen.getByLabelText("Roll name")).toHaveDisplayValue("Retry title");
  expect(mockSuccess).not.toHaveBeenCalled();
  await user.press(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(mockSuccess).toHaveBeenCalledTimes(1));
  expect(mockMutateAsync).toHaveBeenCalledTimes(2);
});

test("locks Save while the mutation is pending", async () => {
  const pending = deferred<unknown>();
  mockMutateAsync.mockReturnValue(pending.promise);
  await render(<TitleFormProbe />);
  const user = userEvent.setup();
  await user.paste(screen.getByLabelText("Roll name"), "Meetup");
  await user.press(screen.getByRole("button", { name: "Save" }));
  expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  await user.press(screen.getByRole("button", { name: "Save" }));
  expect(mockMutateAsync).toHaveBeenCalledTimes(1);
  pending.resolve(buildEvent());
  await waitFor(() => expect(mockSuccess).toHaveBeenCalledTimes(1));
});

test("skips the mutation when the trimmed title matches the current name", async () => {
  await render(<TitleFormProbe />);
  const user = userEvent.setup();
  await user.paste(screen.getByLabelText("Roll name"), "  Weekend meetup  ");
  await user.press(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(mockSuccess).toHaveBeenCalledTimes(1));
  expect(mockMutateAsync).not.toHaveBeenCalled();
});
