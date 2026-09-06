import { render, screen, userEvent } from "@testing-library/react-native";

import { EditProfileModal } from "./EditProfileModal";

test("renders edit profile fields and cancels", async () => {
  const onCancel = jest.fn();

  await render(
    <EditProfileModal
      visible
      isDark={false}
      isSubmitting={false}
      editForm={{ name: "Ada", email: "ada@example.com" }}
      onChangeName={jest.fn()}
      onChangeEmail={jest.fn()}
      onSave={jest.fn()}
      onCancel={onCancel}
    />,
  );

  expect(screen.getByText("Edit Profile")).toBeOnTheScreen();
  expect(screen.getByDisplayValue("Ada")).toBeOnTheScreen();
  expect(screen.getByDisplayValue("ada@example.com")).toBeOnTheScreen();

  const user = userEvent.setup();
  await user.press(screen.getByText("Cancel"));

  expect(onCancel).toHaveBeenCalledTimes(1);
});
