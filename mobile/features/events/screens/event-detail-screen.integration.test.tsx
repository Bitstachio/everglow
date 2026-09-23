import { mockColorScheme } from "../testing/native-mocks";
import "../testing/date-picker-mock";
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

const mockFindOne = jest.fn();
const mockListPhotos = jest.fn();
const mockGetParticipants = jest.fn();
const mockUpdate = jest.fn();
const mockRemove = jest.fn();
const mockLeave = jest.fn();
const mockRemoveParticipant = jest.fn();
const mockUploadPhoto = jest.fn();
const mockDeletePhoto = jest.fn();
const mockBack = jest.fn();
const mockReplace = jest.fn();
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
  eventsControllerUpdate: (...args: unknown[]) => mockUpdate(...args),
  eventsControllerRemove: (...args: unknown[]) => mockRemove(...args),
  eventsControllerLeave: (...args: unknown[]) => mockLeave(...args),
  eventsControllerRemoveParticipant: (...args: unknown[]) => mockRemoveParticipant(...args),
  photosControllerListPhotos: (...args: unknown[]) => mockListPhotos(...args),
}));
jest.mock("@/lib/photo", () => ({
  uploadPhoto: (...args: unknown[]) => mockUploadPhoto(...args),
  deletePhoto: (...args: unknown[]) => mockDeletePhoto(...args),
}));
jest.mock("@/context/auth-context", () => ({ useAuth: () => ({ user: mockUser }) }));
jest.mock("expo-router", () => {
  const React = require("react") as typeof import("react");
  const { View } = jest.requireActual<typeof import("react-native")>("react-native");
  return {
    Stack: {
      Screen: ({ options }: { options?: { headerRight?: () => React.ReactNode } }) =>
        React.createElement(View, { testID: "stack-header-right" }, options?.headerRight?.() ?? null),
    },
    useRouter: () => ({ back: mockBack, replace: mockReplace }),
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
  File: { downloadFileAsync: (...args: unknown[]) => mockDownloadFile(...args) },
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
  mockUpdate.mockReset().mockResolvedValue({ data: { data: buildEvent({ title: "Updated meetup" }) } });
  mockRemove.mockReset().mockResolvedValue({});
  mockLeave.mockReset().mockResolvedValue({});
  mockRemoveParticipant.mockReset().mockResolvedValue({});
  mockUploadPhoto.mockReset().mockResolvedValue(buildPhoto({ id: "photo-2" }));
  mockDeletePhoto.mockReset().mockResolvedValue(undefined);
  mockBack.mockReset();
  mockReplace.mockReset();
  mockRequestLibraryPermission.mockReset().mockResolvedValue({ granted: true });
  mockLaunchLibrary.mockReset().mockResolvedValue({
    canceled: false,
    assets: [{ uri: "file://photo.jpg", fileSize: 2048 }],
  });
  mockRequestMediaPermission.mockReset().mockResolvedValue({ status: "granted" });
  mockCreateAsset.mockReset().mockResolvedValue({});
  mockDownloadFile.mockReset().mockResolvedValue({ uri: "file://cache/photo.jpg" });
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
  expect(screen.getByLabelText("Edit event")).toBeOnTheScreen();
  expect(screen.getByLabelText("View all members, 2")).toBeOnTheScreen();
  expect(screen.getByText("Delete Event")).toBeOnTheScreen();
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
  expect(screen.queryByLabelText("Edit event")).not.toBeOnTheScreen();
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

  await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith("Error", "Event missing"));
  expect(mockBack).toHaveBeenCalledTimes(1);
});

test("edits the event with pasted values and invalidates detail caches", async () => {
  const client = await renderScreen();
  await screen.findByText("Weekend meetup");
  const user = userEvent.setup();
  await user.press(screen.getByLabelText("Edit event"));
  expect(screen.getByText("Edit Event")).toBeOnTheScreen();

  await user.paste(screen.getByPlaceholderText("Enter event title"), "  Updated meetup  ");
  await user.paste(screen.getByPlaceholderText("Enter event description"), "  New details  ");
  await user.press(screen.getByRole("button", { name: "Choose date" }));
  const initial = screen.getByTestId("date-picker").props.value as Date;
  await fireEvent(screen.getByTestId("date-picker"), "change", { type: "set" }, new Date(2031, 1, 10));
  await user.press(screen.getByRole("button", { name: "Choose time" }));
  await fireEvent(screen.getByTestId("time-picker"), "change", { type: "set" }, new Date(2030, 0, 1, 9, 45));
  await user.press(screen.getByText("Save Changes"));

  await waitFor(() => expect(mockUpdate).toHaveBeenCalled());
  const expectedDate = new Date(initial);
  expectedDate.setFullYear(2031, 1, 10);
  expectedDate.setHours(9, 45);
  expect(mockUpdate).toHaveBeenCalledWith({
    path: { eventId: "event-1" },
    body: { title: "Updated meetup", description: "New details", date: expectedDate.toISOString() },
    throwOnError: true,
  });
  expect(Alert.alert).toHaveBeenCalledWith("Success", "Event updated successfully");
  expect(client.getQueryState(eventsKeys.list("user-1"))?.isInvalidated).toBe(true);
});

test("keeps edit values after a failed save and allows retry", async () => {
  mockUpdate.mockRejectedValueOnce(new Error("Network unavailable"));
  await renderScreen();
  await screen.findByText("Weekend meetup");
  const user = userEvent.setup();
  await user.press(screen.getByLabelText("Edit event"));
  await user.paste(screen.getByPlaceholderText("Enter event title"), "Retry title");
  await user.press(screen.getByText("Save Changes"));

  expect(await screen.findByText("Network unavailable")).toBeOnTheScreen();
  expect(screen.getByPlaceholderText("Enter event title")).toHaveDisplayValue("Retry title");
  expect(screen.getByText("Edit Event")).toBeOnTheScreen();

  await user.press(screen.getByText("Save Changes"));
  await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(2));
  expect(Alert.alert).toHaveBeenCalledWith("Success", "Event updated successfully");
});

test("validates required title before calling update", async () => {
  await renderScreen();
  await screen.findByText("Weekend meetup");
  const user = userEvent.setup();
  await user.press(screen.getByLabelText("Edit event"));
  await user.paste(screen.getByPlaceholderText("Enter event title"), "   ");
  await user.press(screen.getByText("Save Changes"));

  expect(await screen.findByText("Event title is required.")).toBeOnTheScreen();
  expect(mockUpdate).not.toHaveBeenCalled();
});

test("uploads a selected photo and refreshes the photo list", async () => {
  await renderScreen();
  await screen.findByText("Weekend meetup");
  const photoCallsBefore = mockListPhotos.mock.calls.length;
  await userEvent.setup().press(screen.getByLabelText("Add photo"));

  await waitFor(() =>
    expect(mockUploadPhoto).toHaveBeenCalledWith(
      "event-1",
      "file://photo.jpg",
      expect.stringMatching(/^event_photo_\d+\.jpg$/),
      "image/jpg",
      2048,
    ),
  );
  expect(Alert.alert).toHaveBeenCalledWith("Success", "Photo uploaded successfully!");
  await waitFor(() => expect(mockListPhotos.mock.calls.length).toBeGreaterThan(photoCallsBefore));
});

test("blocks upload when photo library permission is denied", async () => {
  mockRequestLibraryPermission.mockResolvedValue({ granted: false });
  await renderScreen();
  await screen.findByText("Weekend meetup");
  await userEvent.setup().press(screen.getByLabelText("Add photo"));

  expect(Alert.alert).toHaveBeenCalledWith(
    "Permission Required",
    "Please grant photo library access to upload images.",
  );
  expect(mockLaunchLibrary).not.toHaveBeenCalled();
  expect(mockUploadPhoto).not.toHaveBeenCalled();
});

test("deletes a photo after confirmation", async () => {
  await renderScreen({ photos: [buildPhoto()] });
  await screen.findByLabelText("Event photo photo-1");
  await userEvent.setup().press(screen.getByLabelText("Delete photo photo-1"));
  confirmDestructiveAlert();

  await waitFor(() => expect(mockDeletePhoto).toHaveBeenCalledWith("photo-1"));
  expect(Alert.alert).toHaveBeenCalledWith("Success", "Photo deleted successfully");
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

test("deletes the event and returns to the events root", async () => {
  await renderScreen();
  await screen.findByText("Weekend meetup");
  await userEvent.setup().press(screen.getByText("Delete Event"));
  confirmDestructiveAlert();

  await waitFor(() => expect(mockRemove).toHaveBeenCalledWith({ path: { eventId: "event-1" }, throwOnError: true }));
  expect(mockReplace).toHaveBeenCalledWith("/events");
  expect(Alert.alert).toHaveBeenCalledWith("Success", "Event deleted successfully");
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
