import { mockColorScheme } from "../testing/native-mocks";
import { render, screen, userEvent } from "@testing-library/react-native";
import { buildParticipant, buildPhoto } from "../testing/fixtures";
import { EventPhotoViewer } from "./event-photo-viewer";

// Avatar is decorative, so its image is hidden from accessibility queries by default.
const hidden = { includeHiddenElements: true };

beforeEach(() => {
  mockColorScheme.mockReturnValue("light");
});

test("viewer shows the uploader avatar and username", async () => {
  const photo = buildPhoto({ addedById: "user-2" });
  await render(
    <EventPhotoViewer
      photo={photo}
      participants={[
        buildParticipant(),
        buildParticipant({
          userId: "user-2",
          username: "grace",
          name: "Grace Hopper",
          avatarUrl: "https://cdn.example.com/grace.jpg",
          accessLevel: "PARTICIPANT",
        }),
      ]}
      currentUserId="user-1"
      isAdmin
      onClose={jest.fn()}
      onDownload={jest.fn()}
      onDelete={jest.fn()}
    />,
  );
  expect(screen.getByText("@grace")).toBeOnTheScreen();
  expect(screen.getByLabelText("Uploaded by @grace")).toBeOnTheScreen();
  expect(screen.getByTestId("avatar-image", hidden)).toBeOnTheScreen();
});

test("viewer falls back when the uploader is missing", async () => {
  await render(
    <EventPhotoViewer
      photo={buildPhoto({ addedById: null })}
      participants={[buildParticipant()]}
      currentUserId="user-1"
      isAdmin={false}
      onClose={jest.fn()}
      onDownload={jest.fn()}
      onDelete={jest.fn()}
    />,
  );
  expect(screen.getByText("Unknown")).toBeOnTheScreen();
  expect(screen.getByLabelText("Uploaded by Unknown")).toBeOnTheScreen();
  expect(screen.queryByTestId("avatar-image", hidden)).toBeNull();
  expect(screen.queryByLabelText("Delete photo photo-1")).not.toBeOnTheScreen();
});

test("viewer wires close, download, and delete", async () => {
  const onClose = jest.fn();
  const onDownload = jest.fn();
  const onDelete = jest.fn();
  const photo = buildPhoto();
  await render(
    <EventPhotoViewer
      photo={photo}
      participants={[buildParticipant()]}
      currentUserId="user-1"
      isAdmin={false}
      onClose={onClose}
      onDownload={onDownload}
      onDelete={onDelete}
    />,
  );
  const user = userEvent.setup();
  await user.press(screen.getByLabelText("Close photo"));
  expect(onClose).toHaveBeenCalledTimes(1);
  await user.press(screen.getByLabelText("Download photo photo-1"));
  expect(onDownload).toHaveBeenCalledWith(photo);
  await user.press(screen.getByLabelText("Delete photo photo-1"));
  expect(onDelete).toHaveBeenCalledWith(photo);
});

test("viewer renders nothing when no photo is selected", async () => {
  await render(
    <EventPhotoViewer
      photo={null}
      participants={[buildParticipant()]}
      isAdmin
      onClose={jest.fn()}
      onDownload={jest.fn()}
      onDelete={jest.fn()}
    />,
  );
  expect(screen.queryByTestId("event-photo-viewer")).not.toBeOnTheScreen();
});
