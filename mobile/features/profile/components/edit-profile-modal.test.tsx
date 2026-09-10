import { render, screen, userEvent } from "@testing-library/react-native";
import { useForm } from "react-hook-form";
import { EditProfileModal } from "./edit-profile-modal";

type ModalProbeProps = {
  visible?: boolean;
  isSubmitting?: boolean;
  isDirty?: boolean;
  onSubmit?: () => void;
  onCancel?: () => void;
};

const EditProfileModalProbe = ({
  visible = true,
  isSubmitting = false,
  isDirty = false,
  onSubmit = jest.fn(),
  onCancel = jest.fn(),
}: ModalProbeProps) => {
  const { control } = useForm<{ name: string; email: string }>({
    defaultValues: { name: "Ada", email: "ada@example.com" },
  });

  return (
    <EditProfileModal
      visible={visible}
      isDark={false}
      isSubmitting={isSubmitting}
      isDirty={isDirty}
      control={control}
      onSubmit={onSubmit}
      onCancel={onCancel}
    />
  );
};

test("renders title and seeded fields when visible", async () => {
  await render(<EditProfileModalProbe />);

  expect(screen.getByText("Edit Profile")).toBeOnTheScreen();
  expect(screen.getByText("Name")).toBeOnTheScreen();
  expect(screen.getByText("Email")).toBeOnTheScreen();
  expect(screen.getByDisplayValue("Ada")).toBeOnTheScreen();
  expect(screen.getByDisplayValue("ada@example.com")).toBeOnTheScreen();
  expect(screen.getByPlaceholderText("Enter your name")).toBeOnTheScreen();
  expect(screen.getByPlaceholderText("Enter your email")).toBeOnTheScreen();
});

test("hides content when not visible", async () => {
  await render(<EditProfileModalProbe visible={false} />);

  expect(screen.queryByText("Edit Profile")).not.toBeOnTheScreen();
  expect(screen.queryByDisplayValue("Ada")).not.toBeOnTheScreen();
});

test("disables Save when the form is clean", async () => {
  const onSubmit = jest.fn();
  const user = userEvent.setup();

  await render(<EditProfileModalProbe isDirty={false} onSubmit={onSubmit} />);

  expect(screen.getByText("Save")).toBeDisabled();
  await user.press(screen.getByText("Save"));

  expect(onSubmit).not.toHaveBeenCalled();
});

test("calls onSubmit when Save is pressed and the form is dirty", async () => {
  const onSubmit = jest.fn();
  const user = userEvent.setup();

  await render(<EditProfileModalProbe isDirty onSubmit={onSubmit} />);

  expect(screen.getByText("Save")).toBeEnabled();
  await user.press(screen.getByText("Save"));

  expect(onSubmit).toHaveBeenCalledTimes(1);
});

test("calls onCancel when Cancel is pressed", async () => {
  const onCancel = jest.fn();
  const user = userEvent.setup();

  await render(<EditProfileModalProbe onCancel={onCancel} />);

  await user.press(screen.getByText("Cancel"));

  expect(onCancel).toHaveBeenCalledTimes(1);
});

test("disables Save and Cancel while submitting", async () => {
  const onSubmit = jest.fn();
  const onCancel = jest.fn();
  const user = userEvent.setup();

  await render(<EditProfileModalProbe isDirty isSubmitting onSubmit={onSubmit} onCancel={onCancel} />);

  // Loading replaces the Save label with a spinner
  expect(screen.queryByText("Save")).not.toBeOnTheScreen();
  expect(screen.getByText("Cancel")).toBeDisabled();

  await user.press(screen.getByText("Cancel"));

  expect(onSubmit).not.toHaveBeenCalled();
  expect(onCancel).not.toHaveBeenCalled();
});
