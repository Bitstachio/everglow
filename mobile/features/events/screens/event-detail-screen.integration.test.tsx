import "../testing/native-mocks";
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
import { runAccountCleared } from "@/lib/account-cleared";

const mockFindOne = jest.fn();
const mockListPhotos = jest.fn();
const mockGetParticipants = jest.fn();
const mockLeave = jest.fn();
const mockDeactivate = jest.fn();
const mockRemoveParticipant = jest.fn();
const mockCreateUploadUrls = jest.fn();
const mockConfirmUploads = jest.fn();
const mockFileSize = jest.fn();
const mockUploadAsync = jest.fn();
const mockRemovePhoto = jest.fn();
const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockPush = jest.fn();
const mockRequestLibraryPermission = jest.fn();
const mockLaunchLibrary = jest.fn();
const mockRequestMediaPermission = jest.fn();
const mockCreateAsset = jest.fn();
const mockDownloadFile = jest.fn();
const mockDeleteDownload = jest.fn();
const mockVisits = new Map<string, string>();

let mockUser: { id: string } | null = { id: "user-1" };
let mockParams: { id: string | string[]; arrival?: string; place?: string } = { id: "event-1" };

jest.mock("@/lib/api/generated/client.gen", () => ({ client: { getConfig: () => ({}) } }));
jest.mock("@/lib/api/generated", () => ({
  eventsControllerFindOne: (...args: unknown[]) => mockFindOne(...args),
  eventsControllerGetParticipants: (...args: unknown[]) => mockGetParticipants(...args),
  eventsControllerLeave: (...args: unknown[]) => mockLeave(...args),
  eventsControllerDeactivate: (...args: unknown[]) => mockDeactivate(...args),
  eventsControllerRemoveParticipant: (...args: unknown[]) => mockRemoveParticipant(...args),
  photosControllerListPhotos: (...args: unknown[]) => mockListPhotos(...args),
  photosControllerCreateUploadUrls: (...args: unknown[]) => mockCreateUploadUrls(...args),
  photosControllerConfirmUploads: (...args: unknown[]) => mockConfirmUploads(...args),
  photosControllerRemove: (...args: unknown[]) => mockRemovePhoto(...args),
}));
jest.mock("@/hooks/use-reduce-motion", () => ({ useReduceMotion: () => true }));
jest.mock("@/context/auth-context", () => ({ useAuth: () => ({ user: mockUser }) }));
jest.mock("expo-router", () => ({
  router: { setParams: jest.fn() },
  useRouter: () => ({ back: mockBack, replace: mockReplace, push: mockPush, canGoBack: () => true }),
  useLocalSearchParams: () => mockParams,
}));
jest.mock("expo-secure-store", () => ({
  getItem: (key: string) => mockVisits.get(key) ?? null,
  setItem: (key: string, value: string) => mockVisits.set(key, value),
}));
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
  // The PUT of each photo to storage.
  UploadTask: jest.fn().mockImplementation((file: { uri: string }, url: string) => ({
    uploadAsync: () => mockUploadAsync(file.uri, url),
  })),
  UploadType: { BINARY_CONTENT: 0 },
}));
jest.mock("@react-native-community/netinfo", () => ({ addEventListener: () => () => undefined }));

const DAY = 24 * 60 * 60 * 1000;
const MB = 1024 * 1024;
const fromNow = (ms: number) => new Date(Date.now() + ms).toISOString();

const clients: QueryClient[] = [];

type DetailSeed = {
  event?: ReturnType<typeof buildEvent>;
  photos?: ReturnType<typeof buildPhoto>[];
  participants?: ReturnType<typeof buildParticipant>[];
  /** What the roll reads as when it's fetched again. */
  refetched?: ReturnType<typeof buildEvent>;
};

const openEvent = (overrides: Parameters<typeof buildEvent>[0] = {}) =>
  buildEvent({ galleryOpensAt: fromNow(-2 * DAY), galleryClosesAt: fromNow(23 * DAY), ...overrides });

const host = buildParticipant();
const guest = buildParticipant({ userId: "user-2", name: "Grace Hopper", accessLevel: "PARTICIPANT" });
const viewer = buildParticipant({ userId: "user-3", name: "Kim Lee", accessLevel: "VIEWER" });

const mockDetailResponses = ({ event = openEvent(), photos = [], participants = [host] }: DetailSeed = {}) => {
  mockFindOne.mockResolvedValue({ data: { data: event } });
  mockListPhotos.mockResolvedValue({ data: { data: { items: photos, nextCursor: null } } });
  mockGetParticipants.mockResolvedValue({ data: { data: participants } });
};

const renderScreen = async (seed: DetailSeed = {}) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: 0 } },
  });
  clients.push(client);
  const event = seed.event ?? openEvent();
  mockDetailResponses({ ...seed, event });
  if (seed.refetched) {
    mockFindOne.mockResolvedValueOnce({ data: { data: event } }).mockResolvedValue({ data: { data: seed.refetched } });
  }
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

const oneFrame = [buildPhoto({ createdAt: fromNow(-DAY) })];

beforeEach(() => {
  mockUser = { id: "user-1" };
  mockParams = { id: "event-1" };
  mockVisits.clear();
  mockFindOne.mockReset();
  mockListPhotos.mockReset();
  mockGetParticipants.mockReset();
  mockLeave.mockReset().mockResolvedValue({});
  mockDeactivate.mockReset().mockResolvedValue({ data: { data: openEvent({ galleryState: "CLOSED" }) } });
  mockRemoveParticipant.mockReset().mockResolvedValue({});
  mockCreateUploadUrls.mockReset().mockResolvedValue({
    data: { data: [{ photoId: "photo-2", uploadUrl: "https://upload.example.com/slot" }] },
  });
  mockConfirmUploads.mockReset().mockImplementation(confirmAllReady);
  mockFileSize.mockReset().mockReturnValue(IMAGE_BYTES.length);
  mockUploadAsync.mockReset().mockResolvedValue({ status: 200, body: "", headers: {} });
  runAccountCleared();
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
  mockDeleteDownload.mockReset();
  mockDownloadFile.mockReset().mockResolvedValue({ uri: "file://cache/photo.jpg", delete: mockDeleteDownload });
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

describe("upcoming (07.1, 07.2)", () => {
  const upcoming = () =>
    buildEvent({ galleryState: "UPCOMING", galleryOpensAt: fromNow(4 * DAY - 60_000), galleryClosesAt: null });

  test("a host sees when it opens and can send the envelope", async () => {
    await renderScreen({ event: upcoming() });

    expect(await screen.findByText("Weekend meetup")).toBeOnTheScreen();
    expect(screen.getByText(/Opens in/)).toHaveTextContent("Opens in 4 days");
    expect(screen.getByRole("button", { name: "Send the envelope" })).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Add photos" })).not.toBeOnTheScreen();
    expect(mockListPhotos).not.toHaveBeenCalled();

    await userEvent.setup().press(screen.getByRole("button", { name: "Send the envelope" }));
    expect(mockPush).toHaveBeenCalledWith("/events/event-1/envelope");
  });

  test("unlocks the shutter when it opens while on screen", async () => {
    mockUser = { id: "user-2" };
    await renderScreen({
      event: buildEvent({ galleryState: "UPCOMING", galleryOpensAt: fromNow(-1000), galleryClosesAt: null }),
      refetched: openEvent({ galleryOpensAt: fromNow(-1000) }),
      participants: [host, guest],
    });

    expect(await screen.findByRole("button", { name: "Add photos" })).toBeEnabled();
    expect(mockFindOne).toHaveBeenCalledTimes(2);
  });

  test("a guest finds the shutter locked until it opens", async () => {
    mockUser = { id: "user-2" };
    await renderScreen({ event: upcoming(), participants: [host, guest] });

    const shutter = await screen.findByRole("button", { name: /Adding photos opens/ });
    expect(shutter).toBeDisabled();
    expect(screen.getByText(/0.*frames/)).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Send the envelope" })).not.toBeOnTheScreen();
  });
});

describe("it opens (07.3)", () => {
  test("shows once to someone who looked before it opened", async () => {
    mockVisits.set("roll-visit.user-1.event-1", fromNow(-3 * DAY));
    await renderScreen();

    expect(await screen.findByTestId("roll-opened")).toBeOnTheScreen();
    expect(screen.getByText(/is open\./)).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole("button", { name: "Add the first photos" }));

    await waitFor(() => expect(mockLaunchLibrary).toHaveBeenCalled());
    expect(screen.queryByTestId("roll-opened")).not.toBeOnTheScreen();
    expect(new Date(mockVisits.get("roll-visit.user-1.event-1")!).getTime()).toBeGreaterThan(Date.now() - 60_000);
  });

  test("doesn't show for another account's visit on this device", async () => {
    mockUser = { id: "user-2" };
    await renderScreen({
      event: buildEvent({ galleryState: "UPCOMING", galleryOpensAt: fromNow(DAY), galleryClosesAt: null }),
      participants: [host, guest],
    });
    await screen.findByText("Weekend meetup");
    await screen.unmount();
    // That visit was before the roll opened.
    for (const key of mockVisits.keys()) mockVisits.set(key, fromNow(-3 * DAY));

    mockUser = { id: "user-1" };
    await renderScreen({ participants: [host, guest] });
    expect(await screen.findByText("Weekend meetup")).toBeOnTheScreen();
    expect(screen.queryByTestId("roll-opened")).not.toBeOnTheScreen();
  });

  test("doesn't show to someone who already looked since", async () => {
    mockVisits.set("roll-visit.user-1.event-1", fromNow(-DAY));
    await renderScreen();
    expect(await screen.findByText("Weekend meetup")).toBeOnTheScreen();
    expect(screen.queryByTestId("roll-opened")).not.toBeOnTheScreen();
  });
});

describe("open (07.4–07.8)", () => {
  test("an empty roll points at the shutter", async () => {
    await renderScreen();
    expect(await screen.findByText("first shot’s yours ↓")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Save all frames to Photos" })).toBeDisabled();
  });

  test("a host sees numbered, signed frames, their room, and Invite", async () => {
    await renderScreen({
      event: openEvent({ usage: { members: 2, storageBytes: String(1.2 * 1024 ** 3) } }),
      participants: [host, guest],
      photos: [
        buildPhoto({ id: "photo-2", addedById: "user-2", createdAt: fromNow(-DAY) }),
        buildPhoto({ id: "photo-1", addedById: "user-1", createdAt: fromNow(-2 * DAY) }),
      ],
    });

    expect(await screen.findByLabelText("Frame 2, by Grace")).toBeOnTheScreen();
    expect(screen.getByLabelText("Frame 1, by You")).toBeOnTheScreen();
    expect(screen.getByText(/1\.2.*\/ 3 GB/)).toBeOnTheScreen();
    expect(screen.getByText(/23 days.*left/)).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Add photos" })).toBeEnabled();

    await userEvent.setup().press(screen.getByRole("button", { name: "Invite people" }));
    expect(mockPush).toHaveBeenCalledWith("/events/event-1/envelope");
  });

  test("a guest gets People instead of Invite", async () => {
    mockUser = { id: "user-2" };
    await renderScreen({ participants: [host, guest], photos: oneFrame });
    expect(await screen.findByRole("button", { name: "People on the roll" })).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Invite people" })).not.toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Add photos" })).toBeOnTheScreen();
  });

  test("a view-only guest has no shutter, but can save", async () => {
    mockUser = { id: "user-3" };
    await renderScreen({ participants: [host, viewer], photos: oneFrame });

    expect(await screen.findByText("You can look and save")).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Add photos" })).not.toBeOnTheScreen();
    expect(screen.getByText(/1.*frame/)).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Save all frames to Photos" })).toBeEnabled();
  });

  test("on the last day, the time left counts hours and minutes", async () => {
    await renderScreen({
      event: openEvent({ galleryClosesAt: fromNow(5 * 60 * 60 * 1000 + 42 * 60 * 1000 + 30_000) }),
      photos: oneFrame,
    });
    expect(await screen.findByText(/5h 42m.*left/)).toBeOnTheScreen();
  });

  test("ticks other people's frames added since the last visit", async () => {
    mockVisits.set("roll-visit.user-1.event-1", fromNow(-DAY / 2));
    await renderScreen({
      participants: [host, guest],
      photos: [
        buildPhoto({ id: "photo-2", addedById: "user-2", createdAt: fromNow(-60_000) }),
        buildPhoto({ id: "photo-1", addedById: "user-2", createdAt: fromNow(-DAY) }),
      ],
    });
    expect(await screen.findByLabelText("Frame 2, by Grace, new")).toBeOnTheScreen();
    expect(screen.getByLabelText("Frame 1, by Grace")).toBeOnTheScreen();
  });

  test("loads every page of photos so frames are numbered on the whole roll", async () => {
    await renderScreen({ photos: [] });
    await screen.findByText("Weekend meetup");
    mockListPhotos
      .mockResolvedValueOnce({ data: { data: { items: [buildPhoto({ id: "photo-3" })], nextCursor: "next" } } })
      .mockResolvedValueOnce({
        data: { data: { items: [buildPhoto({ id: "photo-2" }), buildPhoto({ id: "photo-1" })], nextCursor: null } },
      });
    await fireEvent(screen.getByTestId("event-detail-refresh"), "refresh");

    expect(await screen.findByLabelText("Frame 3, by You")).toBeOnTheScreen();
    expect(mockListPhotos).toHaveBeenLastCalledWith(expect.objectContaining({ query: { limit: 100, cursor: "next" } }));
  });
});

describe("arriving from an envelope (06.6, 06.7)", () => {
  test("says which member you are after joining", async () => {
    mockUser = { id: "user-2" };
    mockParams = { id: "event-1", arrival: "joined", place: "2" };
    await renderScreen({ participants: [host, guest], photos: oneFrame });
    expect(await screen.findByRole("alert")).toHaveTextContent("You’re on the roll · 2nd", { exact: false });
  });

  test("says you were already on it", async () => {
    mockParams = { id: "event-1", arrival: "already" };
    await renderScreen({ photos: oneFrame });
    expect(await screen.findByRole("alert")).toHaveTextContent("You’re already on this roll", { exact: false });
  });
});

describe("closed (07.9)", () => {
  test("crosses it out when it closes while on screen", async () => {
    await renderScreen({
      event: openEvent({ galleryClosesAt: fromNow(-1000) }),
      refetched: openEvent({ galleryState: "CLOSED", galleryClosesAt: "2026-09-21T10:00:00.000Z" }),
      photos: oneFrame,
    });

    expect(await screen.findByText("Closed 21.09")).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Add photos" })).not.toBeOnTheScreen();
  });

  test("crosses out the frames and lists who was there", async () => {
    await renderScreen({
      event: buildEvent({
        galleryState: "CLOSED",
        galleryOpensAt: "2026-09-12T10:00:00.000Z",
        galleryClosesAt: "2026-09-21T10:00:00.000Z",
      }),
      participants: [host, guest],
    });

    expect(await screen.findByText("Closed 21.09")).toBeOnTheScreen();
    expect(screen.getByLabelText("The photos were removed on 21 Sep.")).toBeOnTheScreen();
    expect(screen.getByText("Who was there · 2")).toBeOnTheScreen();
    expect(screen.getByText("Grace Hopper")).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Add photos" })).not.toBeOnTheScreen();
    expect(mockListPhotos).not.toHaveBeenCalled();
  });
});

describe("held by Everglow (07.10, 07.11)", () => {
  test("under review: frames stay, the shutter is on hold", async () => {
    await renderScreen({ event: openEvent({ status: "UNDER_REVIEW" }), photos: oneFrame });

    expect(await screen.findByText("Under review")).toBeOnTheScreen();
    expect(screen.getByText("On hold")).toBeOnTheScreen();
    expect(screen.getByLabelText("Frame 1, by You")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "On hold while Everglow reviews" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save all frames to Photos" })).toBeEnabled();
  });

  test("suspended: nothing is shown or fetched, and a host can cut the roll", async () => {
    await renderScreen({ event: openEvent({ status: "SUSPENDED" }) });

    expect(await screen.findByText("Suspended by Everglow")).toBeOnTheScreen();
    expect(screen.getByText("Hidden")).toBeOnTheScreen();
    expect(mockListPhotos).not.toHaveBeenCalled();

    const user = userEvent.setup();
    await user.press(screen.getByRole("button", { name: "Cut the roll" }));
    await user.press(await screen.findByRole("button", { name: "Cut it" }));
    await waitFor(() =>
      expect(mockDeactivate).toHaveBeenCalledWith({ path: { eventId: "event-1" }, throwOnError: true }),
    );
  });

  test("suspended: a guest can only read why", async () => {
    mockUser = { id: "user-2" };
    await renderScreen({ event: openEvent({ status: "SUSPENDED" }), participants: [host, guest] });
    expect(await screen.findByText("Suspended by Everglow")).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Cut the roll" })).not.toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole("button", { name: "What this means ▸" }));
    expect(mockPush).toHaveBeenCalledWith("/terms-of-use");
  });
});

describe("adding photos (08)", () => {
  test("uploads a selected photo and refreshes the roll", async () => {
    await renderScreen({ photos: oneFrame });
    await screen.findByLabelText("Frame 1, by You");
    const photoCallsBefore = mockListPhotos.mock.calls.length;
    await userEvent.setup().press(screen.getByRole("button", { name: "Add photos" }));

    await waitFor(() =>
      expect(mockCreateUploadUrls).toHaveBeenCalledWith({
        path: { eventId: "event-1" },
        // The file's size on disk, not the picker's fileSize.
        body: { files: [{ contentType: "image/jpeg", sizeBytes: IMAGE_BYTES.length }] },
        throwOnError: true,
      }),
    );
    expect(mockUploadAsync).toHaveBeenCalledWith("file://photo.jpg", "https://upload.example.com/slot");
    await waitFor(() =>
      expect(mockConfirmUploads).toHaveBeenCalledWith({
        path: { eventId: "event-1" },
        body: { photoIds: ["photo-2"] },
        throwOnError: true,
      }),
    );
    await waitFor(() => expect(mockListPhotos.mock.calls.length).toBeGreaterThan(photoCallsBefore));
    await waitFor(() => expect(screen.queryByText(/Developing/)).not.toBeOnTheScreen());
  });

  test("picks photos without a crop step (08.1)", async () => {
    await renderScreen();
    await screen.findByText("Weekend meetup");
    await userEvent.setup().press(screen.getByRole("button", { name: "Add photos" }));

    await waitFor(() => expect(mockLaunchLibrary).toHaveBeenCalled());
    const options = mockLaunchLibrary.mock.calls[0][0];
    expect(options).not.toHaveProperty("allowsEditing");
    expect(options).not.toHaveProperty("aspect");
    expect(options).toMatchObject({ allowsMultipleSelection: true, mediaTypes: ["images"] });
  });

  test("shows developing until the picker hands the photos over, and clears it on cancel", async () => {
    const picked = deferred<unknown>();
    mockLaunchLibrary.mockReturnValue(picked.promise);
    await renderScreen();
    await screen.findByText("Weekend meetup");
    await userEvent.setup().press(screen.getByRole("button", { name: "Add photos" }));

    expect(await screen.findByText("Developing…")).toBeOnTheScreen();
    picked.resolve({ canceled: true, assets: null });

    expect(await screen.findByRole("button", { name: "Add photos" })).toBeEnabled();
    expect(mockCreateUploadUrls).not.toHaveBeenCalled();
  });

  test("puts new frames at the top of the sheet while they develop, and opens the tray (08.2)", async () => {
    pickPhotos(2);
    mockCreateUploadUrls.mockImplementation(mintSlotPerFile());
    const sent = deferred<unknown>();
    mockUploadAsync.mockReturnValue(sent.promise);
    await renderScreen({ photos: oneFrame });
    await screen.findByLabelText("Frame 1, by You");
    const user = userEvent.setup();
    await user.press(screen.getByRole("button", { name: "Add photos" }));

    expect(await screen.findByLabelText("Frame 3, developing")).toBeOnTheScreen();
    expect(screen.getByLabelText("Frame 2, developing")).toBeOnTheScreen();
    expect(screen.getByText("Developing 1 of 2")).toBeOnTheScreen();

    await user.press(screen.getByRole("button", { name: "Open the tray" }));
    expect(mockPush).toHaveBeenCalledWith("/events/event-1/tray");
    sent.resolve({ status: 200, body: "", headers: {} });
    await waitFor(() => expect(mockConfirmUploads).toHaveBeenCalled());
  });

  test("uploads many photos in batches of 20 and counts them as they develop", async () => {
    pickPhotos(25);
    mockCreateUploadUrls.mockImplementation(mintSlotPerFile());
    const lastConfirm = deferred<unknown>();
    mockConfirmUploads.mockImplementationOnce(confirmAllReady).mockImplementationOnce(async (request) => {
      await lastConfirm.promise;
      return confirmAllReady(request);
    });
    await renderScreen();
    await screen.findByText("Weekend meetup");
    await userEvent.setup().press(screen.getByRole("button", { name: "Add photos" }));

    expect(await screen.findByText("Developing 21 of 25")).toBeOnTheScreen();
    lastConfirm.resolve(undefined);

    await waitFor(() => expect(screen.queryByText(/Developing/)).not.toBeOnTheScreen());
    expect(mockCreateUploadUrls.mock.calls.map(([request]) => request.body.files.length)).toEqual([20, 5]);
    expect(mockConfirmUploads).toHaveBeenCalledTimes(2);
  });

  test("keeps a frame that didn't take crossed out where it was, and Retry sends it again (08.4)", async () => {
    mockUploadAsync.mockRejectedValueOnce(new TypeError("Network request failed"));
    await renderScreen({ photos: oneFrame });
    await screen.findByLabelText("Frame 1, by You");
    const user = userEvent.setup();
    await user.press(screen.getByRole("button", { name: "Add photos" }));

    expect(await screen.findByText("1 didn’t take · offline")).toBeOnTheScreen();
    expect(screen.getByLabelText("Frame 2, didn’t take")).toBeOnTheScreen();

    await user.press(screen.getByRole("button", { name: "Send them again" }));
    await waitFor(() => expect(mockConfirmUploads).toHaveBeenCalledTimes(1));
    expect(mockCreateUploadUrls).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(screen.queryByText(/didn’t take/)).not.toBeOnTheScreen());
  });

  test("sends what can go and opens the tray when some can't be added (08.5)", async () => {
    mockLaunchLibrary.mockResolvedValue({
      canceled: false,
      assets: [
        { uri: "file://IMG_2231.jpg", fileName: "IMG_2231.jpg" },
        { uri: "file://PANO_2251.jpg", fileName: "PANO_2251.jpg" },
        { uri: "file://IMG_2260.MOV", fileName: "IMG_2260.MOV", type: "video" },
      ],
    });
    mockFileSize.mockImplementation((uri: string) => (uri.includes("PANO") ? 26 * MB : IMAGE_BYTES.length));
    await renderScreen();
    await screen.findByText("Weekend meetup");
    await userEvent.setup().press(screen.getByRole("button", { name: "Add photos" }));

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/events/event-1/tray"));
    await waitFor(() =>
      expect(mockCreateUploadUrls).toHaveBeenCalledWith({
        path: { eventId: "event-1" },
        body: { files: [{ contentType: "image/jpeg", sizeBytes: IMAGE_BYTES.length }] },
        throwOnError: true,
      }),
    );
    expect(await screen.findByText("2 can’t be added")).toBeOnTheScreen();
  });

  test("offers to send the smallest that fit when there isn't room for all (08.6)", async () => {
    mockLaunchLibrary.mockResolvedValue({
      canceled: false,
      assets: [15, 24, 20].map((size) => ({ uri: `file://photo-${size}.jpg` })),
    });
    mockFileSize.mockImplementation((uri: string) => Number(uri.match(/(\d+)/)?.[1]) * MB);
    mockCreateUploadUrls.mockImplementation(mintSlotPerFile());
    await renderScreen({ event: openEvent({ usage: { members: 1, storageBytes: String(3 * 1024 ** 3 - 40 * MB) } }) });
    await screen.findByText("Weekend meetup");
    const user = userEvent.setup();
    await user.press(screen.getByRole("button", { name: "Add photos" }));

    expect(await screen.findByText("Only room for 2 of 3.")).toBeOnTheScreen();
    expect(screen.getByText(/The roll has 40 MB left. Send the 2 smallest now, or make more room./)).toBeOnTheScreen();
    expect(mockCreateUploadUrls).not.toHaveBeenCalled();

    await user.press(screen.getByRole("button", { name: "Send 2" }));
    await waitFor(() =>
      expect(
        mockCreateUploadUrls.mock.calls[0][0].body.files.map((file: { sizeBytes: number }) => file.sizeBytes),
      ).toEqual([15 * MB, 20 * MB]),
    );
  });

  test("Pick again opens the library again instead of sending (08.6)", async () => {
    pickPhotos(3);
    mockFileSize.mockReturnValue(20 * MB);
    await renderScreen({ event: openEvent({ usage: { members: 1, storageBytes: String(3 * 1024 ** 3 - 10 * MB) } }) });
    await screen.findByText("Weekend meetup");
    const user = userEvent.setup();
    await user.press(screen.getByRole("button", { name: "Add photos" }));

    expect(await screen.findByText("No room for these.")).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: /^Send/ })).not.toBeOnTheScreen();
    await user.press(screen.getByRole("button", { name: "Pick again" }));
    // Not over the closing sheet: iOS would take the picker down with it.
    expect(mockLaunchLibrary).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(mockLaunchLibrary).toHaveBeenCalledTimes(2));
    expect(mockCreateUploadUrls).not.toHaveBeenCalled();
  });

  test("locks the shutter when the roll is full: hosts can make room (08.7)", async () => {
    await renderScreen({
      photos: oneFrame,
      event: openEvent({ usage: { members: 1, storageBytes: "3221225472" } }),
    });

    expect(await screen.findByText("Full · hosts can make room")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "The roll is full" })).toBeDisabled();
    await userEvent.setup().press(screen.getByRole("button", { name: "Make more room on the roll" }));
    expect(mockPush).toHaveBeenCalledWith("/events/event-1/settings");
  });

  test("tells a guest on a full roll who to ask (08.7)", async () => {
    mockUser = { id: "user-2" };
    await renderScreen({
      photos: oneFrame,
      participants: [host, guest],
      event: openEvent({ usage: { members: 2, storageBytes: "3221225472" } }),
    });

    expect(await screen.findByText("Full · ask Ada for room")).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Make more room on the roll" })).not.toBeOnTheScreen();
  });

  test("says plainly what didn't make it when the roll closes while sending, with no Retry (08.8)", async () => {
    pickPhotos(25);
    mockCreateUploadUrls
      .mockImplementationOnce(mintSlotPerFile())
      .mockRejectedValueOnce(createApiError("This roll has closed.", { status: 403, code: "EVENT_GALLERY_CLOSED" }));
    await renderScreen();
    await screen.findByText("Weekend meetup");
    const user = userEvent.setup();
    await user.press(screen.getByRole("button", { name: "Add photos" }));

    expect(await screen.findByText("5 photos didn’t make it.")).toBeOnTheScreen();
    expect(
      screen.getByText("The roll closed while they were sending. The other 20 got in before it did."),
    ).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Send them again" })).not.toBeOnTheScreen();

    await user.press(screen.getByRole("button", { name: "Ok" }));
    await waitFor(() => expect(screen.queryByText("5 photos didn’t make it.")).not.toBeOnTheScreen());
  });

  test("uploads a HEIC photo as image/heic", async () => {
    mockLaunchLibrary.mockResolvedValue({ canceled: false, assets: [{ uri: "file://IMG_0001.HEIC" }] });
    await renderScreen();
    await screen.findByText("Weekend meetup");
    await userEvent.setup().press(screen.getByRole("button", { name: "Add photos" }));

    await waitFor(() =>
      expect(mockCreateUploadUrls).toHaveBeenCalledWith({
        path: { eventId: "event-1" },
        body: { files: [{ contentType: "image/heic", sizeBytes: IMAGE_BYTES.length }] },
        throwOnError: true,
      }),
    );
  });

  test("asks for photo access when it's denied", async () => {
    mockRequestLibraryPermission.mockResolvedValue({ granted: false });
    await renderScreen();
    await screen.findByText("Weekend meetup");
    await userEvent.setup().press(screen.getByRole("button", { name: "Add photos" }));

    expect(await screen.findByText("Allow photo access in Settings to add photos.")).toBeOnTheScreen();
    expect(mockLaunchLibrary).not.toHaveBeenCalled();
  });
});

describe("saving and deleting frames", () => {
  test("Save all saves every frame to Photos", async () => {
    await renderScreen({
      photos: [buildPhoto({ id: "photo-2", url: "https://cdn.example.com/2.jpg" }), buildPhoto()],
    });
    await screen.findByLabelText("Frame 2, by You");
    await userEvent.setup().press(screen.getByRole("button", { name: "Save all frames to Photos" }));

    expect(await screen.findByText("2 frames saved to Photos.")).toBeOnTheScreen();
    expect(mockDownloadFile).toHaveBeenCalledWith("https://cdn.example.com/2.jpg", "file://cache", {
      idempotent: true,
    });
    expect(mockCreateAsset).toHaveBeenCalledTimes(2);
    // The library keeps its own copy, so the downloads don't pile up in the cache.
    expect(mockDeleteDownload).toHaveBeenCalledTimes(2);
  });

  test("a missing thumbnail stays a tappable placeholder and never preloads an original", async () => {
    await renderScreen({ photos: [buildPhoto()] });
    await fireEvent(await screen.findByTestId("contact-frame-photo"), "error", { nativeEvent: { error: "not ready" } });
    expect(screen.queryByTestId("contact-frame-photo")).not.toBeOnTheScreen();
    expect(screen.queryByTestId("frame-viewer-photo")).not.toBeOnTheScreen();
    expect(mockDownloadFile).not.toHaveBeenCalled();
    await userEvent.setup().press(screen.getByLabelText("Frame 1, by You"));
    expect(screen.getByTestId("frame-viewer-photo").props.source[0].uri).toBe(buildPhoto().url);
    await userEvent.setup().press(screen.getByRole("button", { name: "Close frame" }));
    expect(screen.queryByTestId("frame-viewer-photo")).not.toBeOnTheScreen();
  });

  test("a frame opens full size, saves, and deletes after the slip", async () => {
    await renderScreen({
      photos: [buildPhoto()],
      event: openEvent({ usage: { members: 1, storageBytes: String(18 * 1024 ** 2) } }),
    });
    const user = userEvent.setup();
    const preview = await screen.findByTestId("contact-frame-photo");
    expect(preview.props.source).toEqual([{ uri: buildPhoto().thumbnailUrl, cacheKey: "photo:photo-1:thumbnail" }]);
    expect(screen.queryByTestId("frame-viewer-photo")).not.toBeOnTheScreen();
    expect(mockDownloadFile).not.toHaveBeenCalled();
    await user.press(await screen.findByLabelText("Frame 1, by You"));
    expect(screen.getByTestId("frame-viewer-photo")).toBeOnTheScreen();
    expect(screen.getByTestId("frame-viewer-photo").props.source).toEqual([
      {
        uri: buildPhoto().url,
        cacheKey: "photo:photo-1:original",
      },
    ]);

    await user.press(screen.getByRole("button", { name: "Save to Photos" }));
    await waitFor(() => expect(mockCreateAsset).toHaveBeenCalledWith("file://cache/photo.jpg"));

    mockDetailResponses({ photos: [] });
    await user.press(screen.getByRole("button", { name: "Delete frame" }));
    await user.press(await screen.findByRole("button", { name: "Delete it" }));

    await waitFor(() =>
      expect(mockRemovePhoto).toHaveBeenCalledWith({ path: { photoId: "photo-1" }, throwOnError: true }),
    );
    expect(await screen.findByText("Frame deleted.")).toBeOnTheScreen();
  });

  test("a guest can't delete someone else's frame", async () => {
    mockUser = { id: "user-2" };
    await renderScreen({ participants: [host, guest], photos: [buildPhoto({ addedById: "user-1" })] });
    await userEvent.setup().press(await screen.findByLabelText("Frame 1, by Ada"));
    expect(screen.getByRole("button", { name: "Save to Photos" })).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Delete frame" })).not.toBeOnTheScreen();
  });
});

describe("people and the menu", () => {
  test("a guest leaves the roll from the menu", async () => {
    mockUser = { id: "user-2" };
    await renderScreen({ participants: [host, guest], photos: oneFrame });
    const user = userEvent.setup();
    await user.press(await screen.findByRole("button", { name: "Roll menu" }));
    await user.press(screen.getByRole("button", { name: "Leave the roll" }));
    await user.press(await screen.findByRole("button", { name: "Leave" }));

    await waitFor(() => expect(mockLeave).toHaveBeenCalledWith({ path: { eventId: "event-1" }, throwOnError: true }));
    expect(mockReplace).toHaveBeenCalledWith("/events");
  });

  test("People from the menu swaps the same sheet to the roll call", async () => {
    mockUser = { id: "user-2" };
    await renderScreen({ participants: [host, guest], photos: oneFrame });
    const user = userEvent.setup();
    await user.press(await screen.findByRole("button", { name: "Roll menu" }));
    await user.press(screen.getByRole("button", { name: "People" }));

    expect(await screen.findByTestId("roll-people")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Grace Hopper (you), Adds photos" })).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Leave the roll" })).not.toBeOnTheScreen();
  });

  test("a host opens roll settings from the menu", async () => {
    await renderScreen({ photos: oneFrame });
    const user = userEvent.setup();
    await user.press(await screen.findByRole("button", { name: "Roll menu" }));
    await user.press(screen.getByRole("button", { name: "Roll settings" }));
    expect(mockPush).toHaveBeenCalledWith("/events/event-1/settings");
  });

  test("a host removes someone from the people sheet", async () => {
    await renderScreen({
      event: openEvent({ usage: { members: 2, storageBytes: "0" } }),
      participants: [host, guest],
      photos: oneFrame,
    });
    const user = userEvent.setup();
    await user.press(await screen.findByRole("button", { name: "2 people on the roll" }));
    await user.press(screen.getByRole("button", { name: "Grace Hopper, Adds photos" }));
    await user.press(await screen.findByRole("button", { name: "Remove from the roll" }));

    await waitFor(() =>
      expect(mockRemoveParticipant).toHaveBeenCalledWith({
        path: { eventId: "event-1", targetUserId: "user-2" },
        throwOnError: true,
      }),
    );
    expect(await screen.findByText("Grace Hopper is off the roll.")).toBeOnTheScreen();
  });
});

test("says so and goes back when the roll fails to load", async () => {
  mockFindOne.mockRejectedValue(new Error("Event missing"));
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

  await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith("Couldn’t load this roll", expect.any(String)));
  expect(mockBack).toHaveBeenCalledTimes(1);
});

test("pull-to-refresh reloads the roll", async () => {
  await renderScreen();
  await screen.findByText("Weekend meetup");
  const pending = deferred<unknown>();
  mockFindOne.mockReturnValue(pending.promise);
  await fireEvent(screen.getByTestId("event-detail-refresh"), "refresh");
  pending.resolve({ data: { data: openEvent({ title: "Refreshed meetup" }) } });
  expect(await screen.findByText("Refreshed meetup")).toBeOnTheScreen();
});
