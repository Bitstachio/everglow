import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { renderWithI18n } from "@/testing/render";
import { screen, userEvent } from "@testing-library/react-native";
import { Text, View } from "react-native";
import { buildEvent } from "../testing/fixtures";
import type { NewEventResponseDto } from "../types";
import { useNewRollForm } from "./use-new-roll-form";

const mockCreate = jest.fn();
jest.mock("../api/mutations", () => ({ useCreateEventMutation: () => ({ mutateAsync: mockCreate }) }));

const NEW_EVENT: NewEventResponseDto = {
  plan: "FREE",
  galleryWindowOptions: [3, 7, 14, 30],
  defaultGalleryWindowDays: 30,
  latestDate: "2027-10-19T12:00:00.000Z",
};

const Probe = ({
  newEvent = NEW_EVENT,
  onCreated = jest.fn(),
}: {
  newEvent?: NewEventResponseDto;
  onCreated?: () => void;
}) => {
  const { form, onSubmit } = useNewRollForm({ newEvent, onCreated });
  const { errors } = form.formState;
  const error = errors.title?.message ?? errors.root?.server?.message;
  return (
    <View>
      <FormField control={form.control} name="title" label="Name" accessibilityLabel="Name" />
      <FormField control={form.control} name="description" label="Line" accessibilityLabel="Line" />
      <Button title="Pick a week" onPress={() => form.setValue("galleryWindowDays", 7, { shouldDirty: true })} />
      <Button title="Load" onPress={onSubmit} />
      {error ? <Text accessibilityRole="alert">{error}</Text> : null}
    </View>
  );
};

beforeEach(() => {
  mockCreate.mockReset().mockResolvedValue(buildEvent({ id: "roll-1" }));
});

test("creates the roll with the trimmed name, the time and the plan's default film", async () => {
  const onCreated = jest.fn();
  await renderWithI18n(<Probe onCreated={onCreated} />);
  const user = userEvent.setup();
  await user.paste(screen.getByLabelText("Name"), "  Nadia turns 30  ");
  await user.press(screen.getByRole("button", { name: "Load" }));

  expect(mockCreate).toHaveBeenCalledWith({
    title: "Nadia turns 30",
    date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
    galleryWindowDays: 30,
  });
  expect(onCreated).toHaveBeenCalledWith(expect.objectContaining({ id: "roll-1" }));
});

test("sends the line for guests and the film the host picked", async () => {
  await renderWithI18n(<Probe />);
  const user = userEvent.setup();
  await user.paste(screen.getByLabelText("Name"), "Nadia turns 30");
  await user.paste(screen.getByLabelText("Line"), "  Bring a jacket  ");
  await user.press(screen.getByRole("button", { name: "Pick a week" }));
  await user.press(screen.getByRole("button", { name: "Load" }));

  expect(mockCreate).toHaveBeenCalledWith(
    expect.objectContaining({ description: "Bring a jacket", galleryWindowDays: 7 }),
  );
});

test("leaves the length to the API on a plan that never closes", async () => {
  await renderWithI18n(<Probe newEvent={{ ...NEW_EVENT, galleryWindowOptions: [], defaultGalleryWindowDays: null }} />);
  const user = userEvent.setup();
  await user.paste(screen.getByLabelText("Name"), "Nadia turns 30");
  await user.press(screen.getByRole("button", { name: "Load" }));

  expect(mockCreate).toHaveBeenCalledWith({ title: "Nadia turns 30", date: expect.any(String) });
});

test("asks for a name before loading", async () => {
  await renderWithI18n(<Probe />);
  await userEvent.setup().press(screen.getByRole("button", { name: "Load" }));

  expect((await screen.findAllByText("Give the roll a name")).length).toBeGreaterThan(0);
  expect(mockCreate).not.toHaveBeenCalled();
});

test("keeps the roll and says why when it didn't load", async () => {
  mockCreate.mockRejectedValueOnce(new Error("Network unavailable"));
  const onCreated = jest.fn();
  await renderWithI18n(<Probe onCreated={onCreated} />);
  const user = userEvent.setup();
  await user.paste(screen.getByLabelText("Name"), "Nadia turns 30");
  await user.press(screen.getByRole("button", { name: "Load" }));

  expect(await screen.findByText("The roll didn’t load. Try again.")).toBeOnTheScreen();
  expect(screen.getByLabelText("Name")).toHaveDisplayValue("Nadia turns 30");
  expect(onCreated).not.toHaveBeenCalled();

  await user.press(screen.getByRole("button", { name: "Load" }));
  expect(mockCreate).toHaveBeenCalledTimes(2);
  expect(onCreated).toHaveBeenCalledTimes(1);
});
