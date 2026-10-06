import { mockColorScheme } from "../testing/native-mocks";
// The integration harness supplies the real data provider and observes native services.
// eslint-disable-next-line no-restricted-imports
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, userEvent, waitFor } from "@testing-library/react-native";
// eslint-disable-next-line no-restricted-imports
import { Alert } from "react-native";
import EventDetailScreen from "./event-detail-screen";
import { buildEvent, buildParticipant, buildPhoto, deferred } from "../testing/fixtures";
// Seed and inspect caches at the integration boundary.
// eslint-disable-next-line no-restricted-imports
import { eventsKeys } from "../api/keys";
import { createApiError } from "@/lib/api/errors";

const mockFindOne = jest.fn();
const mockListPhotos = jest.fn();
const mockGetParticipants = jest.fn();
const mockLeave = jest.fn();
const mockRemoveParticipant = jest.fn();
const mockCreateUploadUrls = jest.fn();
const mockConfirmUploads = jest.fn();
const mockFileSize = jest.fn();
const mockRemovePhoto = jest.fn();
const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockPush = jest.fn();
const mockRequestLibraryPermission = jest.fn();
const mockLaunchLibrary = jest.fn();
const mockRequestMediaPermission = jest.fn();
const mockCreateAsset = jest.fn();
const mockDownloadFile = jest.fn();

let mockUser: { id: string } | null = { id: "user-1" };
let mockEventId: string | string[] = "event-1";

jest.mock("@/lib/api/generated/client.gen", () => ({ client: { getConfig: () => ({}) } }));
jest.mock("@/lib/api/generated", () => ({
  eventsControllerFindOne: (...args: unknown[]) => mockFindOne(...args),
  eventsControllerGetParticipants: (...args: unknown[]) => mockGetParticipants(...args),
  eventsControllerLeave: (...args: unknown[]) => mockLeave(...args),
  eventsControllerRemoveParticipant: (...args: unknown[]) => mockRemoveParticipant(...args),
  photosControllerListPhotos: (...args: unknown[]) => mockListPhotos(...args),
  photosControllerCreateUploadUrls: (...args: unknown[]) => mockCreateUploadUrls(...args),
  photosControllerConfirmUploads: (...args: unknown[]) => mockConfirmUploads(...args),
  photosControllerRemove: (...args: unknown[]) => mockRemovePhoto(...args),
}));
jest.mock("@/context/auth-context", () => ({ useAuth: () => ({ user: mockUser }) }));
jest.mock("expo-router", () => {
  const React = jest.requireActual<typeof import("react")>("react");
  const { View } = jest.requireActual<typeof import("react-native")>("react-native");
  return {
    Stack: {
      Screen: ({ options }: { options?: { headerRight?: () => React.ReactNode } }) =>
        React.createElement(View, { testID: "stack-header-right" }, options?.headerRight?.() ?? null),
    },
    useRouter: () => ({ back: mockBack, replace: mockReplace, push: mockPush }),
    useLocalSearchParams: () => ({ id: mockEventId }),
  };
});
jest.mock("expo-image-picker", () => ({
  requestMediaLibraryPermissionsAsync: (...args: unknown[]) => mockRequestLibraryPermission(...args),
  launchImageLibraryAsync: (...args: unknown[]) => mockLaunchLibrary(...args),
}));
jest.mock("expo-media-library", () => ({
  requestPermissionsAsync: (...args: unknown[]) => mockRequestMediaPermission(...args),
  createAssetAsync: (...args: unknown[]) => mockCreateAsset(...args),
}));
jest.mock("expo-file-system", () => ({
  Paths: { cache: "file://cache" },
  // `new File(uri)` for the size of a picked photo; `File.downloadFileAsync` to save one.
  File: Object.assign(
    jest.fn().mockImplementation((uri: string) => ({ uri, size: mockFileSize(uri) })),
    { downloadFileAsync: (...args: unknown[]) => mockDownloadFile(...args) },
  ),
}));

const clients: QueryClient[] = [];

type DetailSeed = {
  event?: ReturnType<typeof buildEvent>;
  photos?: ReturnType<typeof buildPhoto>[];
  participants?: ReturnType<typeof buildParticipant>[];
};

const mockDetailResponses = ({
  event = buildEvent(),
  photos = [],
  participants = [buildParticipant()],
}: DetailSeed = {}) => {
  mockFindOne.mockResolvedValue({ data: { data: event } });
  mockListPhotos.mockResolvedValue({ data: { data: { items: photos, nextCursor: null } } });
  mockGetParticipants.mockResolvedValue({ data: { data: participants } });
};

const renderScreen = async (seed: DetailSeed = {}) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: 0 } },
  });
  clients.push(client);
  const event = seed.event ?? buildEvent();
  mockDetailResponses({ ...seed, event });
  client.setQueryData(eventsKeys.list("user-1"), [event]);
  await render(
    <QueryClientProvider client={client}>
      <EventDetailScreen />
    </QueryClientProvider>,
  );
  return client;
};

const IMAGE_BYTES = "image-bytes";

const confirmAllReady = ({ body }: { body: { photoIds: string[] } }) =>
  Promise.resolve({ data: { data: body.photoIds.map((photoId) => ({ photoId, status: "READY" })) } });

/** One slot per declared file, numbered across batches. */
const mintSlotPerFile = () => {
  let minted = 0;
  return ({ body }: { body: { files: unknown[] } }) =>
    Promise.resolve({
      data: {
        data: body.files.map(() => {
          minted += 1;
          return { photoId: `photo-new-${minted}`, uploadUrl: `https://upload.example.com/${minted}` };
        }),
      },
    });
};

const pickPhotos = (count: number) =>
  mockLaunchLibrary.mockResolvedValue({
    canceled: false,
    assets: Array.from({ length: count }, (_, index) => ({ uri: `file://photo-${index}.jpg` })),
  });

const confirmDestructiveAlert = () => {
  const calls = jest.mocked(Alert.alert).mock.calls;
  const last = calls[calls.length - 1];
  const buttons = last?.[2] as { text?: string; style?: string; onPress?: () => void }[] | undefined;
  buttons?.find((button) => button.style === "destructive")?.onPress?.();
};

beforeEach(() => {
  mockUser = { id: "user-1" };
  mockEventId = "event-1";
  mockColorScheme.mockReturnValue("light");
  mockFindOne.mockReset();
  mockListPhotos.mockReset();
  mockGetParticipants.mockReset();
  mockLeave.mockReset().mockResolvedValue({});
  mockRemoveParticipant.mockReset().mockResolvedValue({});
  mockCreateUploadUrls.mockReset().mockResolvedValue({
    data: { data: [{ photoId: "photo-2", uploadUrl: "https://upload.example.com/slot" }] },
  });
  mockConfirmUploads.mockReset().mockImplementation(confirmAllReady);
  mockFileSize.mockReset().mockReturnValue(IMAGE_BYTES.length);
  mockRemovePhoto.mockReset().mockResolvedValue({});
  mockBack.mockReset();
  mockReplace.mockReset();
  mockPush.mockReset();
  mockRequestLibraryPermission.mockReset().mockResolvedValue({ granted: true });
  mockLaunchLibrary.mockReset().mockResolvedValue({
    canceled: false,
    assets: [{ uri: "file://photo.jpg", fileSize: 2048 }],
  });
  mockRequestMediaPermission.mockReset().mockResolvedValue({ status: "granted" });
  mockCreateAsset.mockReset().mockResolvedValue({});
  mockDownloadFile.mockReset().mockResolvedValue({ uri: "file://cache/photo.jpg" });
  globalThis.fetch = jest.fn().mockResolvedValue({
    ok: true,
    blob: async () => new Blob([IMAGE_BYTES]),
  }) as typeof fetch;
  jest.spyOn(Alert, "alert").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
  clients.splice(0).forEach((client) => client.clear());
});

test.each(["light", "dark"] as const)("loads event details for an organizer in %s mode", async (theme) => {
  mockColorScheme.mockReturnValue(theme);
  await renderScreen({
    photos: [buildPhoto()],
    participants: [
      buildParticipant(),
      buildParticipant({ userId: "user-2", name: "Grace Hopper", accessLevel: "PARTICIPANT" }),
    ],
  });

  expect(await screen.findByText("Weekend meetup")).toBeOnTheScreen();
  expect(screen.getByText("An afternoon with friends")).toBeOnTheScreen();
  expect(screen.getByLabelText("Event photo photo-1")).toBeOnTheScreen();
  expect(screen.getByLabelText("Event settings")).toBeOnTheScreen();
  expect(screen.getByLabelText("View all members, 2")).toBeOnTheScreen();
  expect(screen.queryByText("Delete Event")).not.toBeOnTheScreen();
  expect(screen.queryByText("Leave Event")).not.toBeOnTheScreen();
});

test("shows leave action for non-admin members without edit or members controls", async () => {
  mockUser = { id: "user-2" };
  await renderScreen({
    event: buildEvent({ creatorId: "user-1" }),
    participants: [
      buildParticipant(),
      buildParticipant({ userId: "user-2", name: "Guest", accessLevel: "PARTICIPANT" }),
    ],
  });

  expect(await screen.findByText("Weekend meetup")).toBeOnTheScreen();
  expect(screen.getByText("Leave Event")).toBeOnTheScreen();
  expect(screen.queryByLabelText("Event settings")).not.toBeOnTheScreen();
  expect(screen.queryByLabelText(/View all members/)).not.toBeOnTheScreen();
  expect(screen.queryByText("Delete Event")).not.toBeOnTheScreen();
});

test("alerts and navigates back when the event fails to load", async () => {
  mockFindOne.mockRejectedValue(new Error("Event missing"));
  mockListPhotos.mockResolvedValue({ data: { data: { items: [], nextCursor: null } } });
  mockGetParticipants.mockResolvedValue({ data: { data: [] } });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: 0 } },
  });
  clients.push(client);
  await render(
    <QueryClientProvider client={client}>
      <EventDetailScreen />
    </QueryClientProvider>,
  );

  await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith("Error", "Failed to load event details"));
  expect(mockBack).toHaveBeenCalledTimes(1);
});

test("opens event settings from the header action", async () => {
  await renderScreen();
  await screen.findByText("Weekend meetup");
  await userEvent.setup().press(screen.getByLabelText("Event settings"));
  expect(mockPush).toHaveBeenCalledWith("/events/event-1/settings");
});

test("shows the gallery's storage, never a photo count", async () => {
  await renderScreen({
    event: buildEvent({ usage: { members: 1, storageBytes: String(1.2 * 1024 ** 3) } }),
  });
  expect(await screen.findByText("1.2 GB of 3 GB used")).toBeOnTheScreen();
});

test("uploads a selected photo and refreshes the photo list", async () => {
  await renderScreen();
  await screen.findByText("Weekend meetup");
  const photoCallsBefore = mockListPhotos.mock.calls.length;
  await userEvent.setup().press(screen.getByLabelText("Add photos"));

  await waitFor(() =>
    expect(mockCreateUploadUrls).toHaveBeenCalledWith({
      path: { eventId: "event-1" },
      // The file's size on disk, not the picker's fileSize.
      body: { files: [{ contentType: "image/jpeg", sizeBytes: IMAGE_BYTES.length }] },
      throwOnError: true,
    }),
  );
  expect(mockConfirmUploads).toHaveBeenCalledWith({
    path: { eventId: "event-1" },
    body: { photoIds: ["photo-2"] },
    throwOnError: true,
  });
  expect(Alert.alert).toHaveBeenCalledWith("Success", "Photo uploaded successfully!");
  await waitFor(() => expect(mockListPhotos.mock.calls.length).toBeGreaterThan(photoCallsBefore));
});

test("picks event photos without a crop step", async () => {
  await renderScreen();
  await screen.findByText("Weekend meetup");
  await userEvent.setup().press(screen.getByLabelText("Add photos"));

  await waitFor(() => expect(mockLaunchLibrary).toHaveBeenCalled());
  const options = mockLaunchLibrary.mock.calls[0][0];
  expect(options).not.toHaveProperty("allowsEditing");
  expect(options).not.toHaveProperty("aspect");
  expect(options).toMatchObject({ allowsMultipleSelection: true });
});

test("shows the upload as preparing until the picker hands the photos over, and clears it on cancel", async () => {
  const picked = deferred<unknown>();
  mockLaunchLibrary.mockReturnValue(picked.promise);
  await renderScreen();
  await screen.findByText("Weekend meetup");
  await userEvent.setup().press(screen.getByLabelText("Add photos"));

  expect(await screen.findByText("Preparing photos…")).toBeOnTheScreen();
  picked.resolve({ canceled: true, assets: null });

  expect(await screen.findByLabelText("Add photos")).toBeOnTheScreen();
  expect(mockCreateUploadUrls).not.toHaveBeenCalled();
});

test("uploads many photos in batches of 20 with one progress label and one result", async () => {
  pickPhotos(25);
  mockCreateUploadUrls.mockImplementation(mintSlotPerFile());
  const lastConfirm = deferred<unknown>();
  mockConfirmUploads.mockImplementationOnce(confirmAllReady).mockImplementationOnce(async (request) => {
    await lastConfirm.promise;
    return confirmAllReady(request);
  });
  await renderScreen();
  await screen.findByText("Weekend meetup");
  const eventCallsBefore = mockFindOne.mock.calls.length;
  await userEvent.setup().press(screen.getByLabelText("Add photos"));

  expect(await screen.findByText("Uploading 25 of 25")).toBeOnTheScreen();
  expect(Alert.alert).not.toHaveBeenCalled();
  lastConfirm.resolve(undefined);

  await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith("Success", "25 photos uploaded successfully!"));
  expect(Alert.alert).toHaveBeenCalledTimes(1);
  expect(mockCreateUploadUrls.mock.calls.map(([request]) => request.body.files.length)).toEqual([20, 5]);
  expect(mockConfirmUploads).toHaveBeenCalledTimes(2);
  expect(await screen.findByLabelText("Add photos")).toBeOnTheScreen();
  await waitFor(() => expect(mockFindOne.mock.calls.length).toBeGreaterThan(eventCallsBefore));
});

test("does not upload a selection bigger than the storage left", async () => {
  pickPhotos(3);
  mockFileSize.mockReturnValue(400 * 1024 * 1024);
  await renderScreen({
    event: buildEvent({ usage: { members: 1, storageBytes: String(2 * 1024 ** 3) } }),
  });
  await screen.findByText("Weekend meetup");
  await userEvent.setup().press(screen.getByLabelText("Add photos"));

  await waitFor(() =>
    expect(Alert.alert).toHaveBeenCalledWith(
      "Not Enough Storage",
      "These 3 photos need 1.2 GB, but this gallery has 1 GB left.",
    ),
  );
  expect(mockCreateUploadUrls).not.toHaveBeenCalled();
});

test.each([
  ["EVENT_STORAGE_LIMIT_REACHED", "This gallery is full. There isn't enough storage left for these photos."],
  ["EVENT_GALLERY_CLOSED", "This event's gallery has closed."],
])("stops on %s, says how many were uploaded, and refetches the event", async (code, message) => {
  pickPhotos(25);
  const mint = mintSlotPerFile();
  mockCreateUploadUrls
    .mockImplementationOnce(mint)
    .mockRejectedValueOnce(createApiError(message, { status: 403, code }));
  await renderScreen();
  await screen.findByText("Weekend meetup");
  const eventCallsBefore = mockFindOne.mock.calls.length;
  await userEvent.setup().press(screen.getByLabelText("Add photos"));

  await waitFor(() =>
    expect(Alert.alert).toHaveBeenCalledWith("Upload Stopped", `${message} 20 of 25 photos uploaded.`),
  );
  expect(mockCreateUploadUrls).toHaveBeenCalledTimes(2);
  await waitFor(() => expect(mockFindOne.mock.calls.length).toBeGreaterThan(eventCallsBefore));
});

test("reports photos that failed to upload once the rest are done", async () => {
  pickPhotos(3);
  mockCreateUploadUrls.mockImplementation(mintSlotPerFile());
  mockConfirmUploads.mockImplementation(({ body }: { body: { photoIds: string[] } }) =>
    Promise.resolve({
      data: {
        data: body.photoIds.map((photoId) => ({
          photoId,
          status: photoId === "photo-new-2" ? "MISMATCHED" : "READY",
        })),
      },
    }),
  );
  await renderScreen();
  await screen.findByText("Weekend meetup");
  await userEvent.setup().press(screen.getByLabelText("Add photos"));

  await waitFor(() =>
    expect(Alert.alert).toHaveBeenCalledWith(
      "Upload Finished",
      "2 of 3 photos uploaded. The rest couldn't be uploaded. Try adding them again.",
    ),
  );
});

test("says so when a single photo fails to upload", async () => {
  mockConfirmUploads.mockResolvedValue({ data: { data: [{ photoId: "photo-2", status: "MISSING" }] } });
  await renderScreen();
  await screen.findByText("Weekend meetup");
  await userEvent.setup().press(screen.getByLabelText("Add photos"));

  await waitFor(() =>
    expect(Alert.alert).toHaveBeenCalledWith("Error", "Your photo couldn't be uploaded. Please try again."),
  );
});

test.each([
  ["the picker's mimeType", { uri: "file://IMG_0001.HEIC", mimeType: "image/heic" }],
  ["an uppercase extension", { uri: "file://IMG_0001.HEIC" }],
])("uploads a HEIC photo as image/heic from %s", async (_source, asset) => {
  mockLaunchLibrary.mockResolvedValue({ canceled: false, assets: [asset] });
  await renderScreen();
  await screen.findByText("Weekend meetup");
  await userEvent.setup().press(screen.getByLabelText("Add photos"));

  await waitFor(() =>
    expect(mockCreateUploadUrls).toHaveBeenCalledWith({
      path: { eventId: "event-1" },
      body: { files: [{ contentType: "image/heic", sizeBytes: IMAGE_BYTES.length }] },
      throwOnError: true,
    }),
  );
  expect(Alert.alert).toHaveBeenCalledWith("Success", "Photo uploaded successfully!");
});

test("blocks upload when photo library permission is denied", async () => {
  mockRequestLibraryPermission.mockResolvedValue({ granted: false });
  await renderScreen();
  await screen.findByText("Weekend meetup");
  await userEvent.setup().press(screen.getByLabelText("Add photos"));

  expect(Alert.alert).toHaveBeenCalledWith(
    "Permission Required",
    "Please grant photo library access to upload images.",
  );
  expect(mockLaunchLibrary).not.toHaveBeenCalled();
  expect(mockCreateUploadUrls).not.toHaveBeenCalled();
});

test("deletes a photo after confirmation and refreshes the gallery's storage", async () => {
  await renderScreen({
    photos: [buildPhoto()],
    event: buildEvent({ usage: { members: 1, storageBytes: String(18 * 1024 ** 2) } }),
  });
  await screen.findByLabelText("Event photo photo-1");
  expect(screen.getByText("18 MB of 3 GB used")).toBeOnTheScreen();
  mockDetailResponses({ photos: [] });
  await userEvent.setup().press(screen.getByLabelText("Delete photo photo-1"));
  confirmDestructiveAlert();

  await waitFor(() =>
    expect(mockRemovePhoto).toHaveBeenCalledWith({ path: { photoId: "photo-1" }, throwOnError: true }),
  );
  expect(Alert.alert).toHaveBeenCalledWith("Success", "Photo deleted successfully");
  expect(await screen.findByText("0 B of 3 GB used")).toBeOnTheScreen();
});

test("downloads a photo to the media library", async () => {
  await renderScreen({ photos: [buildPhoto()] });
  await screen.findByLabelText("Event photo photo-1");
  await userEvent.setup().press(screen.getByLabelText("Download photo photo-1"));

  await waitFor(() =>
    expect(mockDownloadFile).toHaveBeenCalledWith("https://cdn.example.com/photo-1.jpg", "file://cache"),
  );
  expect(mockCreateAsset).toHaveBeenCalledWith("file://cache/photo.jpg");
  expect(Alert.alert).toHaveBeenCalledWith("Success", "Photo downloaded successfully!");
});

test("leaves the event as a non-admin member", async () => {
  mockUser = { id: "user-2" };
  await renderScreen({
    participants: [
      buildParticipant(),
      buildParticipant({ userId: "user-2", name: "Guest", accessLevel: "PARTICIPANT" }),
    ],
  });

  await screen.findByText("Leave Event");
  await userEvent.setup().press(screen.getByText("Leave Event"));
  confirmDestructiveAlert();

  await waitFor(() => expect(mockLeave).toHaveBeenCalledWith({ path: { eventId: "event-1" }, throwOnError: true }));
  expect(mockReplace).toHaveBeenCalledWith("/events");
});

test("removes a member from the members sheet", async () => {
  await renderScreen({
    participants: [
      buildParticipant(),
      buildParticipant({ userId: "user-2", name: "Grace Hopper", accessLevel: "PARTICIPANT" }),
    ],
  });

  await screen.findByText("Weekend meetup");
  const user = userEvent.setup();
  await user.press(screen.getByLabelText("View all members, 2"));
  expect(screen.getByText("Grace Hopper")).toBeOnTheScreen();
  await user.press(screen.getByLabelText("Remove Grace Hopper"));
  confirmDestructiveAlert();

  await waitFor(() =>
    expect(mockRemoveParticipant).toHaveBeenCalledWith({
      path: { eventId: "event-1", targetUserId: "user-2" },
      throwOnError: true,
    }),
  );
  expect(Alert.alert).toHaveBeenCalledWith("Success", "Member removed successfully");
});

test("pull-to-refresh reloads event, photos, and participants", async () => {
  await renderScreen();
  await screen.findByText("Weekend meetup");
  const pending = deferred<unknown>();
  mockFindOne.mockReturnValue(pending.promise);
  await fireEvent(screen.getByTestId("event-detail-refresh"), "refresh");
  expect(mockFindOne).toHaveBeenCalledTimes(2);
  pending.resolve({ data: { data: buildEvent({ title: "Refreshed meetup" }) } });
  expect(await screen.findByText("Refreshed meetup")).toBeOnTheScreen();
});

test("shows the empty photos state when an event has no photos", async () => {
  await renderScreen({ photos: [] });
  expect(await screen.findByText("No photos yet")).toBeOnTheScreen();
});
