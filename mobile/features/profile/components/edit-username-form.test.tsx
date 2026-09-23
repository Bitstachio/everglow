import { render, screen, userEvent } from "@testing-library/react-native";
import { useForm } from "react-hook-form";
import { EditUsernameForm } from "./edit-username-form";

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 12, left: 0 }),
}));

type EditUsernameFormProbeProps = {
  isDirty?: boolean;
  isSubmitting?: boolean;
  onSubmit?: () => void;
};

const EditUsernameFormProbe = ({
  isDirty = false,
  isSubmitting = false,
  onSubmit = jest.fn(),
}: EditUsernameFormProbeProps) => {
  const { control } = useForm<{ username: string }>({ defaultValues: { username: "ada" } });

  return <EditUsernameForm control={control} isDirty={isDirty} isSubmitting={isSubmitting} onSubmit={onSubmit} />;
};

test("renders the current username and editing guidance", async () => {
  await render(<EditUsernameFormProbe />);

  expect(screen.getByLabelText("Username")).toHaveDisplayValue("ada");
  expect(screen.getByText(/change your username up to 5 times/i)).toBeOnTheScreen();
  expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
});

test("submits when the form is dirty", async () => {
  const onSubmit = jest.fn();
  const user = userEvent.setup();
  await render(<EditUsernameFormProbe isDirty onSubmit={onSubmit} />);

  const saveButton = screen.getByRole("button", { name: "Save" });
  expect(saveButton).toBeEnabled();
  await user.press(saveButton);

  expect(onSubmit).toHaveBeenCalledTimes(1);
});

test("disables editing and saving while submitting", async () => {
  const onSubmit = jest.fn();
  await render(<EditUsernameFormProbe isDirty isSubmitting onSubmit={onSubmit} />);

  expect(screen.getByLabelText("Username")).toBeDisabled();
  const saveButton = screen.getByRole("button", { name: "Save" });
  expect(saveButton).toBeDisabled();
  expect(saveButton).toBeBusy();
  expect(onSubmit).not.toHaveBeenCalled();
});
