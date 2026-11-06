import { renderWithI18n } from "@/testing/render";
import { screen, userEvent } from "@testing-library/react-native";
import { SettingsTextEdit } from "./settings-text-edit";

const onSave = jest.fn();
const onChangeText = jest.fn();

beforeEach(() => {
  onSave.mockReset();
  onChangeText.mockReset();
});

test("shows the hint, count, and keeps Save disabled until dirty", async () => {
  await renderWithI18n(
    <SettingsTextEdit
      value="Weekend meetup"
      onChangeText={onChangeText}
      accessibilityLabel="Roll name"
      hint="Shown on the roll."
      saveLabel="Save"
      onSave={onSave}
      isDirty={false}
      isSubmitting={false}
      maxLength={100}
    />,
  );

  expect(screen.getByLabelText("Roll name")).toHaveDisplayValue("Weekend meetup");
  expect(screen.getByText("Shown on the roll.")).toBeOnTheScreen();
  expect(screen.getByLabelText("14 of 100 characters")).toBeOnTheScreen();
  expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
});

test("optional label and Save when dirty", async () => {
  await renderWithI18n(
    <SettingsTextEdit
      label="A line for guests · optional"
      value="Bring a jacket"
      onChangeText={onChangeText}
      accessibilityLabel="Note for guests"
      hint="Shown on the envelope."
      saveLabel="Save"
      onSave={onSave}
      isDirty
      isSubmitting={false}
    />,
  );

  expect(screen.getByText("A line for guests · optional")).toBeOnTheScreen();
  await userEvent.setup().press(screen.getByRole("button", { name: "Save" }));
  expect(onSave).toHaveBeenCalledTimes(1);
});

test("shows an error", async () => {
  await renderWithI18n(
    <SettingsTextEdit
      value=""
      onChangeText={onChangeText}
      accessibilityLabel="Roll name"
      hint="Hint"
      error="Give the roll a name"
      saveLabel="Save"
      onSave={onSave}
      isDirty={false}
      isSubmitting={false}
    />,
  );

  expect(screen.getByText("Give the roll a name")).toBeOnTheScreen();
});
