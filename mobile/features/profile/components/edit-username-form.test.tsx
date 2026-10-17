import { renderWithI18n } from "@/testing/render";
import { fireEvent, screen, userEvent } from "@testing-library/react-native";
import { useForm } from "react-hook-form";
import { EditUsernameForm } from "./edit-username-form";
import type { UsernameAvailabilityState } from "../lib/username";

// The pencil tick draws on instantly, so its animation doesn't outlive a test.
jest.mock("@/hooks/use-reduce-motion", () => ({ useReduceMotion: () => true }));

const available: UsernameAvailabilityState = {
  status: "available",
  username: "ada.l",
  reason: null,
  message: "Username is available",
  canSubmit: true,
  suggestions: [],
};

type ProbeProps = {
  username?: string;
  isDirty?: boolean;
  isSubmitting?: boolean;
  availability?: UsernameAvailabilityState;
  onSubmit?: () => void;
};

const Probe = ({
  username = "ada.l",
  isDirty = true,
  isSubmitting = false,
  availability = available,
  onSubmit = jest.fn(),
}: ProbeProps) => {
  const { control } = useForm<{ username: string }>({ defaultValues: { username } });
  return (
    <EditUsernameForm
      control={control}
      username={username}
      isDirty={isDirty}
      isSubmitting={isSubmitting}
      availability={availability}
      onSubmit={onSubmit}
    />
  );
};

test("a free handle is ticked and changes from the leader", async () => {
  const onSubmit = jest.fn();
  await renderWithI18n(<Probe onSubmit={onSubmit} />);

  expect(screen.getByLabelText("Username")).toHaveDisplayValue("ada.l");
  expect(screen.getByText("Available")).toBeOnTheScreen();
  expect(screen.getByText("You can change it twice every 14 days")).toBeOnTheScreen();
  expect(screen.getByText("Your old handle becomes free for anyone after the change.")).toBeOnTheScreen();
  await userEvent.setup().press(screen.getByRole("button", { name: "Change to @ada.l" }));
  expect(onSubmit).toHaveBeenCalledTimes(1);
});

test("the current handle can't be changed to itself", async () => {
  await renderWithI18n(<Probe username="ada" isDirty={false} availability={{ ...available, username: "ada" }} />);

  expect(screen.queryByText("Available")).not.toBeOnTheScreen();
  expect(screen.getByRole("button", { name: "Change to @ada" })).toBeDisabled();
});

test("a taken handle says so in pencil and can't be used", async () => {
  await renderWithI18n(
    <Probe
      username="taken"
      availability={{
        status: "unavailable",
        username: "taken",
        reason: "TAKEN",
        message: "This username is taken",
        canSubmit: false,
        suggestions: [],
      }}
    />,
  );

  expect(screen.getByText("Taken")).toBeOnTheScreen();
  expect(screen.getByText("This username is taken")).toBeOnTheScreen();
  expect(screen.getByRole("button", { name: "Change to @taken" })).toBeDisabled();
});

test("editing and the leader wait while the change is saved", async () => {
  const onSubmit = jest.fn();
  await renderWithI18n(<Probe isSubmitting onSubmit={onSubmit} />);

  expect(screen.getByLabelText("Username")).toHaveProp("editable", false);
  const leader = screen.getByRole("button", { name: "Change to @ada.l" });
  expect(leader).toBeDisabled();
  expect(leader).toBeBusy();
});

test("lowercases the handle as it is typed, as in onboarding", async () => {
  await renderWithI18n(<Probe username="" isDirty={false} />);
  const field = screen.getByLabelText("Username");
  await fireEvent.changeText(field, "Ada");
  expect(field).toHaveProp("value", "ada");
});
