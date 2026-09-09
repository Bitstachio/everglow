import { render, screen, userEvent } from "@testing-library/react-native";
import { useForm } from "react-hook-form";
import { EditProfileModal } from "./EditProfileModal";

const EditProfileModalProbe = ({ onCancel }: { onCancel: () => void }) => {
  const { control } = useForm<{ name: string; email: string }>({
    defaultValues: { name: "Ada", email: "ada@example.com" },
  });

  return (
    <EditProfileModal
      visible
      isDark={false}
      isSubmitting={false}
      isDirty={false}
      control={control}
      onSubmit={jest.fn()}
      onCancel={onCancel}
    />
  );
};

test("renders edit profile fields and cancels", async () => {
  const onCancel = jest.fn();

  await render(<EditProfileModalProbe onCancel={onCancel} />);

  expect(screen.getByText("Edit Profile")).toBeOnTheScreen();
  expect(screen.getByDisplayValue("Ada")).toBeOnTheScreen();
  expect(screen.getByDisplayValue("ada@example.com")).toBeOnTheScreen();

  const user = userEvent.setup();
  await user.press(screen.getByText("Cancel"));

  expect(onCancel).toHaveBeenCalledTimes(1);
});
