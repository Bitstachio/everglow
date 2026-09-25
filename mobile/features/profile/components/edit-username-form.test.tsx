import { render, screen, userEvent } from "@testing-library/react-native";
import { useForm } from "react-hook-form";
import { EditUsernameForm } from "./edit-username-form";
import type { UsernameAvailabilityState } from "../lib/username";

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 12, left: 0 }),
}));

const available: UsernameAvailabilityState = {
  status: "available",
  username: "ada",
  reason: null,
  message: "Username is available",
  canSubmit: true,
};

type EditUsernameFormProbeProps = {
  isDirty?: boolean;
  isSubmitting?: boolean;
  availability?: UsernameAvailabilityState;
  onSubmit?: () => void;
};

const EditUsernameFormProbe = ({
  isDirty = false,
  isSubmitting = false,
  availability = available,
  onSubmit = jest.fn(),
}: EditUsernameFormProbeProps) => {
  const { control } = useForm<{ username: string }>({ defaultValues: { username: "ada" } });

  return (
    <EditUsernameForm
      control={control}
      isDirty={isDirty}
      isSubmitting={isSubmitting}
      availability={availability}
      onSubmit={onSubmit}
    />
  );
};

test("renders the current username and format guidance without a change cap", async () => {
  await render(<EditUsernameFormProbe />);

  expect(screen.getByLabelText("Username")).toHaveDisplayValue("ada");
  expect(screen.getByText(/lowercase letters, numbers, periods, or underscores/i)).toBeOnTheScreen();
  expect(screen.queryByText(/5 times within 30 minutes/i)).not.toBeOnTheScreen();
  expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
});

test("submits when dirty and available", async () => {
  const onSubmit = jest.fn();
  const user = userEvent.setup();
  await render(<EditUsernameFormProbe isDirty onSubmit={onSubmit} />);

  const saveButton = screen.getByRole("button", { name: "Save" });
  expect(saveButton).toBeEnabled();
  await user.press(saveButton);

  expect(onSubmit).toHaveBeenCalledTimes(1);
});

test("keeps Save disabled while availability forbids submit", async () => {
  await render(
    <EditUsernameFormProbe
      isDirty
      availability={{
        status: "unavailable",
        username: "taken",
        reason: "TAKEN",
        message: "This username is taken",
        canSubmit: false,
      }}
    />,
  );

  expect(screen.getByText("This username is taken")).toBeOnTheScreen();
  expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
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
