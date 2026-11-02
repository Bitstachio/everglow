import { render, screen, userEvent, waitFor } from "@testing-library/react-native";
import { EditEventDescriptionForm } from "../components/edit-event-description-form";
import { buildEvent, deferred } from "../testing/fixtures";
import { useEditEventDescriptionForm } from "./use-edit-event-description-form";

const mockMutateAsync = jest.fn();
const mockSuccess = jest.fn();

jest.mock("../api/mutations", () => ({
  useUpdateEventMutation: () => ({ mutateAsync: mockMutateAsync }),
}));

const NoteFormProbe = ({ initialDescription = "Bring a jacket" }: { initialDescription?: string }) => {
  const { form, onSubmit } = useEditEventDescriptionForm({
    eventId: "event-1",
    initialDescription,
    onSuccess: mockSuccess,
  });
  return (
    <EditEventDescriptionForm
      control={form.control}
      isDirty={form.formState.isDirty}
      isSubmitting={form.formState.isSubmitting}
      error={form.formState.errors.root?.server?.message}
      onSubmit={onSubmit}
      label="A line for guests · optional"
      placeholder="Bring a jacket, we’re on the roof"
      accessibilityLabel="Note for guests, optional"
      hint="Shown on the envelope. Leave blank to remove it."
      saveLabel="Save"
    />
  );
};

beforeEach(() => {
  mockMutateAsync.mockReset().mockResolvedValue(buildEvent({ description: "Updated note" }));
  mockSuccess.mockReset();
});

test("submits a trimmed note", async () => {
  await render(<NoteFormProbe />);
  const user = userEvent.setup();
  await user.paste(screen.getByLabelText("Note for guests, optional"), "  Dress warm  ");
  await user.press(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(mockSuccess).toHaveBeenCalledTimes(1));
  expect(mockMutateAsync).toHaveBeenCalledWith({ description: "Dress warm" });
});

test("clears the note when left blank", async () => {
  await render(<NoteFormProbe />);
  const user = userEvent.setup();
  await user.clear(screen.getByLabelText("Note for guests, optional"));
  await user.press(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(mockSuccess).toHaveBeenCalledTimes(1));
  expect(mockMutateAsync).toHaveBeenCalledWith({ description: null });
});

test("surfaces server errors and keeps values for retry", async () => {
  mockMutateAsync.mockRejectedValueOnce(new Error("Network unavailable"));
  await render(<NoteFormProbe />);
  const user = userEvent.setup();
  await user.paste(screen.getByLabelText("Note for guests, optional"), "Retry note");
  await user.press(screen.getByRole("button", { name: "Save" }));
  expect(await screen.findByText("Couldn’t update the note. Try again.")).toBeOnTheScreen();
  expect(screen.getByLabelText("Note for guests, optional")).toHaveDisplayValue("Retry note");
  expect(mockSuccess).not.toHaveBeenCalled();
  await user.press(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(mockSuccess).toHaveBeenCalledTimes(1));
  expect(mockMutateAsync).toHaveBeenCalledTimes(2);
});

test("locks Save while the mutation is pending", async () => {
  const pending = deferred<unknown>();
  mockMutateAsync.mockReturnValue(pending.promise);
  await render(<NoteFormProbe />);
  const user = userEvent.setup();
  await user.paste(screen.getByLabelText("Note for guests, optional"), "Almost ready");
  await user.press(screen.getByRole("button", { name: "Save" }));
  expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  await user.press(screen.getByRole("button", { name: "Save" }));
  expect(mockMutateAsync).toHaveBeenCalledTimes(1);
  pending.resolve(buildEvent());
  await waitFor(() => expect(mockSuccess).toHaveBeenCalledTimes(1));
});

test("skips the mutation when the trimmed note matches the current note", async () => {
  await render(<NoteFormProbe />);
  const user = userEvent.setup();
  await user.paste(screen.getByLabelText("Note for guests, optional"), "  Bring a jacket  ");
  await user.press(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(mockSuccess).toHaveBeenCalledTimes(1));
  expect(mockMutateAsync).not.toHaveBeenCalled();
});
