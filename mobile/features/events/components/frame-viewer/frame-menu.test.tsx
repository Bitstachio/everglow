import "../../testing/native-mocks";
import { renderWithI18n } from "@/testing/render";
import { screen, userEvent } from "@testing-library/react-native";
import { buildPhoto } from "../../testing/fixtures";
import { FrameMenu } from "./frame-menu";

test.each([
  { isOwn: true, canDelete: true, title: "Your frame", action: "Delete for everyone" },
  { isOwn: false, canDelete: true, title: "Leila’s frame", action: "Delete Leila’s frame" },
  { isOwn: false, canDelete: false, title: "Leila’s frame", action: null },
])("shows the permitted actions for $title (delete: $canDelete)", async ({ isOwn, canDelete, title, action }) => {
  const onDelete = jest.fn();
  await renderWithI18n(
    <FrameMenu
      frame={{ photo: buildPhoto(), number: 1, by: "Leila", uploader: null, isNew: false }}
      name="Leila"
      time="Sun 21:42"
      isOwn={isOwn}
      canDelete={canDelete}
      visible
      onClose={jest.fn()}
      onClosed={jest.fn()}
      onSave={jest.fn()}
      onShare={jest.fn()}
      onDelete={onDelete}
    />,
  );
  expect(screen.getByText(title)).toBeOnTheScreen();
  expect(screen.getByRole("button", { name: "Save to Photos" })).toBeOnTheScreen();
  expect(screen.getByRole("button", { name: "Share" })).toBeOnTheScreen();
  if (action) {
    await userEvent.setup().press(screen.getByRole("button", { name: action }));
    expect(onDelete).toHaveBeenCalledTimes(1);
  } else {
    expect(screen.queryByRole("button", { name: /Delete/ })).not.toBeOnTheScreen();
  }
});
