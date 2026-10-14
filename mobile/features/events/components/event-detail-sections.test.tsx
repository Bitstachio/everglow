import { mockColorScheme } from "../testing/native-mocks";
import { render, screen, userEvent } from "@testing-library/react-native";
import { EventDetailInfo } from "./event-detail-info";
import { EventPhotosSection } from "./event-photos-section";
import { EventMembersSheet } from "./event-members-sheet";
import { buildEvent, buildParticipant, buildPhoto } from "../testing/fixtures";
import { formatEventDateTime, getAccessLevelLabel } from "../utils";

beforeEach(() => {
  mockColorScheme.mockReturnValue("light");
});

test("event detail info shows title, formatted date, and description", async () => {
  const event = buildEvent();
  const { date, time } = formatEventDateTime(event.date);
  await render(<EventDetailInfo event={event} />);
  expect(screen.getByText(event.title)).toBeOnTheScreen();
  expect(screen.getByText(date)).toBeOnTheScreen();
  expect(screen.getByText(time)).toBeOnTheScreen();
  expect(screen.getByText(event.description!)).toBeOnTheScreen();
});

test("event detail info omits description when missing", async () => {
  await render(<EventDetailInfo event={buildEvent({ description: null })} />);
  expect(screen.queryByText("Description")).not.toBeOnTheScreen();
});

test("photos section shows empty state and upload control", async () => {
  const onUpload = jest.fn();
  await render(
    <EventPhotosSection
      photos={[]}
      isAdmin
      uploadStatus={null}
      storageLabel={null}
      onUpload={onUpload}
      onDownload={jest.fn()}
      onDelete={jest.fn()}
      failedUploads={[]}
      onFailedUploadPress={jest.fn()}
    />,
  );
  expect(screen.getByText("No photos yet")).toBeOnTheScreen();
  await userEvent.setup().press(screen.getByLabelText("Add photos"));
  expect(onUpload).toHaveBeenCalledTimes(1);
});

test("photos section shows the gallery's storage and one progress label while uploading", async () => {
  const onUpload = jest.fn();
  await render(
    <EventPhotosSection
      photos={[]}
      isAdmin
      uploadStatus={{ phase: "uploading", done: 34, total: 120 }}
      storageLabel="1.2 GB of 3 GB used"
      onUpload={onUpload}
      onDownload={jest.fn()}
      onDelete={jest.fn()}
      failedUploads={[]}
      onFailedUploadPress={jest.fn()}
    />,
  );
  expect(screen.getByText("1.2 GB of 3 GB used")).toBeOnTheScreen();
  expect(screen.getByText("Uploading 34 of 120")).toBeOnTheScreen();
  const button = screen.getByRole("button", { name: "Uploading 34 of 120" });
  expect(button).toBeDisabled();
  await userEvent.setup().press(button);
  expect(onUpload).not.toHaveBeenCalled();
});

test("photos section wires download and delete for own photos", async () => {
  const onDownload = jest.fn();
  const onDelete = jest.fn();
  const photo = buildPhoto();
  await render(
    <EventPhotosSection
      photos={[photo]}
      currentUserId="user-1"
      isAdmin={false}
      uploadStatus={null}
      storageLabel={null}
      onUpload={jest.fn()}
      onDownload={onDownload}
      onDelete={onDelete}
      failedUploads={[]}
      onFailedUploadPress={jest.fn()}
    />,
  );
  const user = userEvent.setup();
  await user.press(screen.getByLabelText("Download photo photo-1"));
  expect(onDownload).toHaveBeenCalledWith(photo);
  await user.press(screen.getByLabelText("Delete photo photo-1"));
  expect(onDelete).toHaveBeenCalledWith(photo);
});

test("photos section hides delete for other members' photos", async () => {
  await render(
    <EventPhotosSection
      photos={[buildPhoto({ addedById: "user-9" })]}
      currentUserId="user-2"
      isAdmin={false}
      uploadStatus={null}
      storageLabel={null}
      onUpload={jest.fn()}
      onDownload={jest.fn()}
      onDelete={jest.fn()}
      failedUploads={[]}
      onFailedUploadPress={jest.fn()}
    />,
  );
  expect(screen.queryByLabelText("Delete photo photo-1")).not.toBeOnTheScreen();
});

test("photos section shows that the selection is being prepared before the upload starts", async () => {
  await render(
    <EventPhotosSection
      photos={[]}
      isAdmin
      uploadStatus={{ phase: "preparing" }}
      storageLabel={null}
      onUpload={jest.fn()}
      onDownload={jest.fn()}
      onDelete={jest.fn()}
      failedUploads={[]}
      onFailedUploadPress={jest.fn()}
    />,
  );
  expect(screen.getByText("Preparing photos…")).toBeOnTheScreen();
  expect(screen.getByRole("button", { name: "Preparing photos…" })).toBeDisabled();
});

test("members sheet lists roles and allows removing non-organizers", async () => {
  const onRemove = jest.fn();
  await render(
    <EventMembersSheet
      visible
      participants={[
        buildParticipant(),
        buildParticipant({
          userId: "user-2",
          name: "Grace Hopper",
          username: "grace",
          accessLevel: "PARTICIPANT",
        }),
      ]}
      onClose={jest.fn()}
      onRemove={onRemove}
    />,
  );
  expect(screen.getByText("Ada Lovelace")).toBeOnTheScreen();
  expect(screen.getByText("@ada")).toBeOnTheScreen();
  expect(screen.getByText(getAccessLevelLabel("ORGANIZER"))).toBeOnTheScreen();
  expect(screen.getByText("Grace Hopper")).toBeOnTheScreen();
  expect(screen.getByText("@grace")).toBeOnTheScreen();
  expect(screen.queryByLabelText("Remove Ada Lovelace")).not.toBeOnTheScreen();
  await userEvent.setup().press(screen.getByLabelText("Remove Grace Hopper"));
  expect(onRemove).toHaveBeenCalledWith("user-2");
});

test("photos section shows photos that failed to upload first, and opens their actions", async () => {
  const onFailedUploadPress = jest.fn();
  await render(
    <EventPhotosSection
      photos={[buildPhoto()]}
      isAdmin
      uploadStatus={null}
      storageLabel={null}
      onUpload={jest.fn()}
      onDownload={jest.fn()}
      onDelete={jest.fn()}
      failedUploads={[{ uri: "file://failed.jpg" }]}
      onFailedUploadPress={onFailedUploadPress}
    />,
  );
  expect(screen.queryByText("No photos yet")).not.toBeOnTheScreen();
  expect(screen.getByText("Not uploaded")).toBeOnTheScreen();
  await userEvent.setup().press(screen.getByRole("button", { name: "Photo not uploaded. Retry or remove" }));
  expect(onFailedUploadPress).toHaveBeenCalledWith("file://failed.jpg");
});

test("photos section shows failed uploads even when the gallery is empty, and locks them while uploading", async () => {
  const onFailedUploadPress = jest.fn();
  await render(
    <EventPhotosSection
      photos={[]}
      isAdmin
      uploadStatus={{ phase: "uploading", done: 0, total: 1 }}
      storageLabel={null}
      onUpload={jest.fn()}
      onDownload={jest.fn()}
      onDelete={jest.fn()}
      failedUploads={[{ uri: "file://failed.jpg" }]}
      onFailedUploadPress={onFailedUploadPress}
    />,
  );
  expect(screen.queryByText("No photos yet")).not.toBeOnTheScreen();
  const tile = screen.getByRole("button", { name: "Photo not uploaded. Retry or remove" });
  expect(tile).toBeDisabled();
  await userEvent.setup().press(tile);
  expect(onFailedUploadPress).not.toHaveBeenCalled();
});
