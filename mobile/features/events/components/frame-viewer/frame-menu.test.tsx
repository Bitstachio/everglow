import "../../testing/native-mocks";
import { renderWithI18n } from "@/testing/render";
import { screen, userEvent } from "@testing-library/react-native";
import { buildPhoto } from "../../testing/fixtures";
import { FrameMenu, frameMenuHasActions } from "./frame-menu";

test.each([
  { isOwn: true, canDelete: true, action: "Delete for everyone" },
  { isOwn: false, canDelete: true, action: "Delete Leila’s photo" },
  { isOwn: false, canDelete: false, action: null },
  { isOwn: false, canDelete: true, deleted: true, action: "Delete this photo" },
])("shows the permitted delete action (delete: $canDelete, own: $isOwn)", async ({ isOwn, canDelete, deleted, action }) => {
  const onDelete = jest.fn();
  await renderWithI18n(
    <FrameMenu
      frame={{
        photo: buildPhoto({ addedById: deleted ? null : "leila" }),
        number: 1,
        by: deleted ? null : "Leila",
        uploader: null,
        deleted: deleted ?? false,
        isNew: false,
      }}
      name={deleted ? "Deleted account" : "Leila"}
      isOwn={isOwn}
      canDelete={canDelete}
      visible
      onClose={jest.fn()}
      onClosed={jest.fn()}
      onDelete={onDelete}
    />,
  );
  expect(screen.queryByRole("button", { name: "Save to Photos" })).not.toBeOnTheScreen();
  expect(screen.queryByRole("button", { name: "Share" })).not.toBeOnTheScreen();
  if (action) {
    await userEvent.setup().press(screen.getByRole("button", { name: action }));
    expect(onDelete).toHaveBeenCalledTimes(1);
  } else {
    expect(screen.queryByRole("button", { name: /Delete/ })).not.toBeOnTheScreen();
  }
});

test("someone else's frame can be reported and its owner blocked", async () => {
  const onReport = jest.fn();
  const onBlock = jest.fn();
  await renderWithI18n(
    <FrameMenu
      frame={{ photo: buildPhoto(), number: 1, by: "Leila", uploader: null, deleted: false, isNew: false }}
      name="Leila"
      isOwn={false}
      canDelete={false}
      visible
      onClose={jest.fn()}
      onClosed={jest.fn()}
      onDelete={jest.fn()}
      onReport={onReport}
      onBlock={onBlock}
    />,
  );
  const user = userEvent.setup();
  await user.press(screen.getByRole("button", { name: "Report this photo" }));
  await user.press(screen.getByRole("button", { name: "Block Leila" }));
  expect(onReport).toHaveBeenCalledTimes(1);
  expect(onBlock).toHaveBeenCalledTimes(1);
});

test("your own frame offers neither report nor block", async () => {
  await renderWithI18n(
    <FrameMenu
      frame={{ photo: buildPhoto(), number: 1, by: "You", uploader: null, deleted: false, isNew: false }}
      name="You"
      isOwn
      canDelete
      visible
      onClose={jest.fn()}
      onClosed={jest.fn()}
      onDelete={jest.fn()}
    />,
  );
  expect(screen.queryByRole("button", { name: /Report|Block/ })).not.toBeOnTheScreen();
  expect(screen.getByRole("button", { name: "Delete for everyone" })).toBeOnTheScreen();
});

test.each([
  { canDelete: false, onReport: undefined, onBlock: undefined, expected: false },
  { canDelete: true, onReport: undefined, onBlock: undefined, expected: true },
  { canDelete: false, onReport: jest.fn(), onBlock: undefined, expected: true },
  { canDelete: false, onReport: undefined, onBlock: jest.fn(), expected: true },
])("frameMenuHasActions is $expected when delete=$canDelete", ({ canDelete, onReport, onBlock, expected }) => {
  expect(frameMenuHasActions({ canDelete, onReport, onBlock })).toBe(expected);
});
