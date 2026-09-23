import { render, screen, userEvent, fireEvent } from "@testing-library/react-native";
import { useForm } from "react-hook-form";
import { EditDisplayNameForm } from "./edit-display-name-form";

const Probe = ({
  isDirty = false,
  isSubmitting = false,
  error,
  onSubmit = jest.fn(),
}: {
  isDirty?: boolean;
  isSubmitting?: boolean;
  error?: string;
  onSubmit?: () => void;
}) => {
  const { control } = useForm({ defaultValues: { name: "Ada" } });
  return (
    <EditDisplayNameForm
      control={control}
      isDirty={isDirty}
      isSubmitting={isSubmitting}
      error={error}
      onSubmit={onSubmit}
    />
  );
};

test("shows the current name and guidance without enabling an unchanged save", async () => {
  const onSubmit = jest.fn();
  await render(<Probe onSubmit={onSubmit} />);
  expect(screen.getByLabelText("Display Name")).toHaveDisplayValue("Ada");
  expect(screen.getByText(/Help people recognize you/)).toBeOnTheScreen();
  expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  await userEvent.setup().press(screen.getByRole("button", { name: "Save" }));
  expect(onSubmit).not.toHaveBeenCalled();
});

test("connects both Save and keyboard Done to submission", async () => {
  const onSubmit = jest.fn();
  await render(<Probe isDirty onSubmit={onSubmit} />);
  await userEvent.setup().press(screen.getByRole("button", { name: "Save" }));
  expect(onSubmit).toHaveBeenCalledTimes(1);
  await fireEvent(screen.getByLabelText("Display Name"), "submitEditing");
  expect(onSubmit).toHaveBeenCalledTimes(2);
});

test("blocks edits and duplicate saves while submitting", async () => {
  const onSubmit = jest.fn();
  await render(<Probe isDirty isSubmitting onSubmit={onSubmit} />);
  expect(screen.getByLabelText("Display Name")).toBeDisabled();
  const save = screen.getByRole("button", { name: "Save" });
  expect(save).toBeDisabled();
  expect(save).toBeBusy();
  await userEvent.setup().press(save);
  expect(onSubmit).not.toHaveBeenCalled();
});

test("announces a save error while retaining the editable name", async () => {
  await render(<Probe isDirty error="Please try again." />);
  expect(screen.getByRole("alert")).toHaveTextContent("Please try again.");
  expect(screen.getByLabelText("Display Name")).toHaveDisplayValue("Ada");
  expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
});
