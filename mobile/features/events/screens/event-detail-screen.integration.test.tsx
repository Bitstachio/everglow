import { mockSharePhotos } from "../testing/native-mocks";
// The integration harness supplies the real data provider and observes native services.
// eslint-disable-next-line no-restricted-imports
import { QueryClient, QueryClientProvider, focusManager } from "@tanstack/react-query";
import { act, fireEvent, render, screen, userEvent, waitFor, within } from "@testing-library/react-native";
// eslint-disable-next-line no-restricted-imports
import { Alert, Dimensions } from "react-native";
import { State } from "react-native-gesture-handler";
import { fireGestureHandler, getByGestureTestId } from "react-native-gesture-handler/jest-utils";
import EventDetailScreen from "./event-detail-screen";
import { PAGE_GAP } from "../components/frame-viewer/paging";
import { buildEvent, buildParticipant, buildPhoto, deferred } from "../testing/fixtures";
// Seed and inspect caches at the integration boundary.
// eslint-disable-next-line no-restricted-imports
import { eventsKeys } from "../api/keys";
import { createApiError } from "@/lib/api/errors";
import UploadTrayScreen from "./upload-tray-screen";
import { addToTray, activateUploadTrays } from "../lib/upload-tray";
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
const mockUploadProgress = new Map<string, (progress: { bytesSent: number }) => void>();
const mockRemovePhoto = jest.fn();
const mockFindPhoto = jest.fn();
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
let mockTrayFocused = true;

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
  photosControllerFindOne: (...args: unknown[]) => mockFindPhoto(...args),
}));
jest.mock("@/hooks/use-reduce-motion", () => ({ useReduceMotion: () => true }));
jest.mock("@/context/auth-context", () => ({ useAuth: () => ({ user: mockUser }) }));
jest.mock("expo-router", () => ({
  router: { setParams: jest.fn() },
  useRouter: () => ({ back: mockBack, replace: mockReplace, push: mockPush, canGoBack: () => true }),
  useLocalSearchParams: () => mockParams,
  useFocusEffect: (callback: () => void | (() => void)) => {
    const { useEffect } = jest.requireActual<typeof import("react")>("react");
    const focused = mockTrayFocused;
    useEffect(() => {
      if (focused) return callback();
    }, [callback, focused]);
  },
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
  Asset: { create: (...args: unknown[]) => mockCreateAsset(...args) },
  // SDK 57's root export warns and throws; do not hide that incompatibility in tests.
  createAssetAsync: () => {
    throw new Error("Use Asset.create instead");
  },
}));
jest.mock("../lib/upload-tray-storage", () => ({
  retainUploadFiles: async (_userId: string, items: unknown[]) => items,
  persistUploadTrays: jest.fn(),
  restoreUploadTrays: () => new Map(),
  releaseUploadFile: jest.fn(),
  removeUploadStorage: jest.fn(),
}));
jest.mock("expo-file-system", () => ({
  Paths: { cache: "file://cache" },
  // `new File(uri)` for the size of a picked photo; `File.downloadFileAsync` to save one.
  File: Object.assign(
    jest.fn().mockImplementation((uri: string, filename?: string) => ({
      uri: filename ? `${uri}/${filename}` : uri,
      size: mockFileSize(uri),
    })),
    { downloadFileAsync: (...args: unknown[]) => mockDownloadFile(...args) },
  ),
  // The PUT of each photo to storage.
  UploadTask: jest
    .fn()
    .mockImplementation(
      (file: { uri: string }, url: string, options: { onProgress: (progress: { bytesSent: number }) => void }) => {
        mockUploadProgress.set(file.uri, options.onProgress);
        return { uploadAsync: () => mockUploadAsync(file.uri, url) };
      },
    ),
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
  mockFindPhoto.mockImplementation(async ({ path }: { path: { photoId: string } }) => ({
    data: { data: photos.find((photo) => photo.id === path.photoId) ?? buildPhoto({ id: path.photoId }) },
  }));
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

/** Each save downloads to a temporary file of its own, numbered after the frame's id. */
const temporaryFile = (photoId: string, suffix = "jpg") =>
  expect.stringMatching(new RegExp(`^file://cache/everglow-${photoId}-\\d+\\.${suffix}$`));

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

/** Save all, through the slip that asks whether to include the caller's own frames. */
const saveAll = async (user: ReturnType<typeof userEvent.setup>, { includeMine = true } = {}) => {
  await user.press(await screen.findByRole("button", { name: "Save all frames to Photos" }));
  const include = await screen.findByRole("checkbox", { name: /^Include \d+ you added$/ });
  if (includeMine) await user.press(include);
  await user.press(screen.getByRole("button", { name: /^Save \d+$/ }));
  await act(async () => screen.getByTestId("save-roll-dialog", { includeHiddenElements: true }).props.onDismiss());
};

beforeEach(() => {
  mockUser = { id: "user-1" };
  mockParams = { id: "event-1" };
  mockTrayFocused = true;
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
  mockUploadProgress.clear();
  runAccountCleared("signedOut");
  activateUploadTrays("user-1", async () => undefined);
  mockFindPhoto.mockClear();
  mockSharePhotos.mockClear();
  mockRemovePhoto.mockReset().mockResolvedValue({});
  mockFindPhoto.mockReset().mockImplementation(async ({ path }: { path: { photoId: string } }) => ({
    data: { data: buildPhoto({ id: path.photoId, url: `https://cdn.example.com/${path.photoId}?renewed` }) },
  }));
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
  mockDownloadFile.mockReset().mockImplementation(async (_url: string, destination: { uri: string }) => ({
    uri: destination.uri,
    delete: mockDeleteDownload,
  }));
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

  test("a host sees uploader portraits and names without frame numbers, their room, and Invite", async () => {
    await renderScreen({
      event: openEvent({ usage: { members: 2, storageBytes: String(1.2 * 1024 ** 3) } }),
      participants: [
        { ...host, avatarUrl: "https://img/ada" },
        { ...guest, avatarUrl: "https://img/grace" },
      ],
      photos: [
        buildPhoto({ id: "photo-2", addedById: "user-2", createdAt: fromNow(-DAY) }),
        buildPhoto({ id: "photo-1", addedById: "user-1", createdAt: fromNow(-2 * DAY) }),
      ],
    });

    expect(await screen.findByLabelText("Frame 2, by Grace")).toBeOnTheScreen();
    expect(screen.getByLabelText("Frame 1, by You")).toBeOnTheScreen();
    for (const [label, name, uri] of [
      ["Frame 2, by Grace", "Grace", "https://img/grace"],
      ["Frame 1, by You", "You", "https://img/ada"],
    ]) {
      const frame = within(screen.getByLabelText(label));
      // Seen, but not read out again: the frame's label already names the uploader.
      expect(frame.queryByText(name)).toBeNull();
      expect(frame.getByText(name, { includeHiddenElements: true })).toBeOnTheScreen();
      expect(frame.queryByText(/^\d+$/, { includeHiddenElements: true })).toBeNull();
      expect(frame.getByTestId("avatar-image", { includeHiddenElements: true })).toHaveProp(
        "source",
        expect.arrayContaining([expect.objectContaining({ uri })]),
      );
    }
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

  test("loads later pages only as the contact sheet reaches its end", async () => {
    await renderScreen({ photos: [] });
    await screen.findByText("Weekend meetup");
    mockListPhotos
      .mockResolvedValueOnce({ data: { data: { items: [buildPhoto({ id: "photo-3" })], nextCursor: "next" } } })
      .mockResolvedValueOnce({
        data: { data: { items: [buildPhoto({ id: "photo-2" }), buildPhoto({ id: "photo-1" })], nextCursor: null } },
      });
    await fireEvent(screen.getByTestId("event-detail-refresh"), "refresh");

    expect(await screen.findByLabelText("Frame 1, by You")).toBeOnTheScreen();
    await fireEvent(screen.getByTestId("roll-sheet"), "endReached");
    expect(await screen.findByLabelText("Frame 3, by You")).toBeOnTheScreen();
    expect(mockListPhotos).toHaveBeenLastCalledWith(expect.objectContaining({ query: { limit: 60, cursor: "next" } }));
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

  const closedEvent = () =>
    buildEvent({
      galleryState: "CLOSED",
      galleryOpensAt: "2026-09-12T10:00:00.000Z",
      galleryClosesAt: "2026-09-21T10:00:00.000Z",
    });

  test("a guest who can't leave is told why", async () => {
    mockUser = { id: "user-2" };
    await renderScreen({ event: closedEvent(), participants: [host, guest] });
    mockLeave.mockRejectedValueOnce(createApiError("Couldn’t leave this roll.", { status: 400 }));
    const user = userEvent.setup();
    await user.press(await screen.findByRole("button", { name: "Roll menu" }));
    await user.press(screen.getByRole("button", { name: "Leave the roll" }));
    // A closed roll can't be joined again, so the slip doesn't offer the envelope.
    expect(await screen.findByText("It has closed, so you can’t join it again.")).toBeOnTheScreen();
    await user.press(screen.getByRole("button", { name: "Leave" }));

    expect(await screen.findByText("Couldn’t leave this roll.")).toBeOnTheScreen();
    expect(screen.getByText("Closed 21.09")).toBeOnTheScreen();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  test("a host who takes someone off says so", async () => {
    await renderScreen({ event: closedEvent(), participants: [host, guest] });
    const user = userEvent.setup();
    await user.press(await screen.findByRole("button", { name: "Roll menu" }));
    await user.press(screen.getByRole("button", { name: "People" }));
    await user.press(await screen.findByRole("button", { name: "Grace Hopper, Adds photos" }));
    await user.press(await screen.findByRole("button", { name: "Remove from the roll" }));

    expect(await screen.findByText("Grace Hopper is off the roll.")).toBeOnTheScreen();
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
    const cut = openEvent({ status: "SUSPENDED", galleryState: "CLOSED" });
    mockDeactivate.mockResolvedValue({ data: { data: cut } });
    mockFindOne.mockResolvedValue({ data: { data: cut } });

    expect(await screen.findByText("Suspended by Everglow")).toBeOnTheScreen();
    expect(screen.getByText("Hidden")).toBeOnTheScreen();
    expect(mockListPhotos).not.toHaveBeenCalled();

    const user = userEvent.setup();
    await user.press(screen.getByRole("button", { name: "Cut the roll" }));
    // Deletion copy says what goes and for whom (docs/voice.md).
    expect(
      await screen.findByText(
        "Its frames are removed for everyone now, and it stops counting toward your rolls. This can’t be undone.",
      ),
    ).toBeOnTheScreen();
    await user.press(screen.getByRole("button", { name: "Cut it" }));
    await waitFor(() =>
      expect(mockDeactivate).toHaveBeenCalledWith({ path: { eventId: "event-1" }, throwOnError: true }),
    );
    expect(await screen.findByText("Roll cut.")).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Cut the roll" })).not.toBeOnTheScreen();
    expect(screen.getByText("Suspended by Everglow")).toBeOnTheScreen();
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
        signal: expect.any(Object),
        throwOnError: true,
      }),
    );
    expect(mockUploadAsync).toHaveBeenCalledWith("file://photo.jpg", "https://upload.example.com/slot");
    await waitFor(() =>
      expect(mockConfirmUploads).toHaveBeenCalledWith({
        path: { eventId: "event-1" },
        body: { photoIds: ["photo-2"] },
        signal: expect.any(Object),
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

    await user.press(screen.getByText("Developing 1 of 2"));
    expect(mockPush).toHaveBeenCalledWith("/events/event-1/tray");
    await user.press(screen.getByText("Tray ›"));
    expect(mockPush).toHaveBeenCalledTimes(2);
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
    const client = await renderScreen({ photos: oneFrame });
    await screen.findByLabelText("Frame 1, by You");
    const user = userEvent.setup();
    await user.press(screen.getByRole("button", { name: "Add photos" }));

    expect(await screen.findByText("1 didn’t take · offline")).toBeOnTheScreen();
    expect(screen.getByLabelText("Frame 2, didn’t take")).toBeOnTheScreen();
    expect(screen.getByTestId("tray-needs-attention", { includeHiddenElements: true })).toBeOnTheScreen();
    await user.press(screen.getByText("1 didn’t take · offline"));
    expect(mockPush).toHaveBeenCalledWith("/events/event-1/tray");
    await screen.rerender(
      <QueryClientProvider client={client}>
        <UploadTrayScreen />
      </QueryClientProvider>,
    );

    mockConfirmUploads.mockResolvedValueOnce({ data: { data: [{ photoId: "photo-2", status: "MISSING" }] } });
    await user.press(await screen.findByRole("button", { name: "Retry ↻" }));
    await waitFor(() => expect(mockConfirmUploads).toHaveBeenCalledTimes(2));
    expect(mockCreateUploadUrls).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(screen.queryByText(/didn’t take/)).not.toBeOnTheScreen());
  });

  test("native bytes fill the tray bar, which finishes before confirmation marks it Developed", async () => {
    const uploaded = deferred<unknown>();
    const confirmed = deferred<unknown>();
    mockFileSize.mockReturnValue(100);
    mockUploadAsync.mockReturnValueOnce(uploaded.promise);
    mockConfirmUploads.mockReturnValueOnce(confirmed.promise);
    const client = await renderScreen();
    const user = userEvent.setup();
    await user.press(await screen.findByRole("button", { name: "Add photos" }));
    await user.press(await screen.findByText("Developing 1 of 1"));
    await screen.rerender(
      <QueryClientProvider client={client}>
        <UploadTrayScreen />
      </QueryClientProvider>,
    );
    expect(await screen.findByRole("progressbar", { name: "Photo 1, Developing" })).toHaveAccessibilityValue({
      now: 0,
    });
    await act(async () => mockUploadProgress.get("file://photo.jpg")!({ bytesSent: 50 }));
    expect(screen.getByRole("progressbar", { name: "Photo 1, Developing" })).toHaveAccessibilityValue({ now: 50 });
    await act(async () => mockUploadProgress.get("file://photo.jpg")!({ bytesSent: 100 }));
    expect(screen.getByRole("progressbar", { name: "Photo 1, Finishing" })).toHaveAccessibilityValue({ now: 100 });
    await act(async () => uploaded.resolve({ status: 200, body: "", headers: {} }));
    await waitFor(() => expect(mockConfirmUploads).toHaveBeenCalledTimes(1));
    expect(screen.queryByLabelText("Photo 1, Developed")).not.toBeOnTheScreen();
    await act(async () => confirmed.resolve({ data: { data: [{ photoId: "photo-2", status: "READY" }] } }));
    expect(await screen.findByLabelText("Photo 1, Developed")).toBeOnTheScreen();
    expect(screen.queryByRole("progressbar")).not.toBeOnTheScreen();
    expect(screen.queryByText(/MB/)).not.toBeOnTheScreen();
  });

  test("one failed photo can be retried and another removed without uploading both", async () => {
    pickPhotos(2);
    mockCreateUploadUrls.mockImplementation(mintSlotPerFile());
    mockUploadAsync.mockResolvedValue({ status: 403, body: "", headers: {} });
    const client = await renderScreen();
    const user = userEvent.setup();
    await user.press(await screen.findByRole("button", { name: "Add photos" }));
    await screen.findByText("2 didn’t take");
    await user.press(screen.getByRole("button", { name: "Open the tray, some photos need attention" }));
    await screen.rerender(
      <QueryClientProvider client={client}>
        <UploadTrayScreen />
      </QueryClientProvider>,
    );
    mockUploadAsync.mockReset().mockResolvedValue({ status: 200, body: "", headers: {} });
    mockConfirmUploads.mockResolvedValueOnce({ data: { data: [{ photoId: "photo-new-1", status: "MISSING" }] } });
    await user.press(await screen.findByRole("button", { name: "Retry Photo 1" }));
    await waitFor(() => expect(screen.getByLabelText(/Photo 1, Developed/)).toBeOnTheScreen());
    expect(mockUploadAsync).toHaveBeenCalledTimes(1);
    expect(mockUploadAsync.mock.calls[0][0]).toBe("file://photo-0.jpg");
    expect(screen.getByRole("button", { name: "Retry Photo 2" })).toBeOnTheScreen();
    await user.press(screen.getByRole("button", { name: "Remove Photo 2 from the tray" }));
    expect(screen.queryByLabelText(/Photo 2,/)).not.toBeOnTheScreen();
    expect(mockUploadAsync).toHaveBeenCalledTimes(1);
    expect(mockRemovePhoto).not.toHaveBeenCalled();
  });

  test("an unmeasurable selection stays visible without preventing the other photo from uploading", async () => {
    mockLaunchLibrary.mockResolvedValue({
      canceled: false,
      assets: [
        { uri: "file://unavailable.jpg", fileName: "Unavailable.jpg" },
        { uri: "file://valid.jpg", fileName: "Valid.jpg" },
      ],
    });
    mockFileSize.mockImplementation((uri: string) => (uri.includes("unavailable") ? 0 : IMAGE_BYTES.length));
    const client = await renderScreen();
    await userEvent.setup().press(await screen.findByRole("button", { name: "Add photos" }));
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/events/event-1/tray"));
    expect(mockCreateUploadUrls).toHaveBeenCalledWith(
      expect.objectContaining({ body: { files: [{ contentType: "image/jpeg", sizeBytes: IMAGE_BYTES.length }] } }),
    );
    await screen.rerender(
      <QueryClientProvider client={client}>
        <UploadTrayScreen />
      </QueryClientProvider>,
    );
    expect(await screen.findByLabelText("Unavailable, Didn’t take · file unavailable")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Remove Unavailable from the tray" })).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Retry Unavailable" })).not.toBeOnTheScreen();
    expect(mockUploadAsync).toHaveBeenCalledWith("file://valid.jpg", expect.any(String));
  });

  test("the attention button stays available while another photo uploads and after it completes", async () => {
    pickPhotos(2);
    mockCreateUploadUrls.mockImplementation(mintSlotPerFile());
    const pending = deferred<unknown>();
    mockUploadAsync.mockResolvedValueOnce({ status: 503, body: "", headers: {} }).mockReturnValueOnce(pending.promise);
    await renderScreen();
    const user = userEvent.setup();
    await user.press(await screen.findByRole("button", { name: "Add photos" }));
    expect(await screen.findByRole("button", { name: "Open the tray, some photos need attention" })).toBeOnTheScreen();
    expect(screen.getByText("Developing 1 of 1")).toBeOnTheScreen();
    expect(screen.getByTestId("tray-needs-attention", { includeHiddenElements: true })).toBeOnTheScreen();
    await user.press(screen.getByRole("button", { name: "Open the tray, some photos need attention" }));
    expect(mockPush).toHaveBeenCalledWith("/events/event-1/tray");
    await act(async () => pending.resolve({ status: 200, body: "", headers: {} }));
    expect(await screen.findByText("1 didn’t take")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Open the tray, some photos need attention" })).toBeOnTheScreen();
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
        signal: expect.any(Object),
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

  test("counts photos still in the tray against the room left (08.6)", async () => {
    mockLaunchLibrary
      .mockResolvedValueOnce({ canceled: false, assets: [{ uri: "file://photo-24.jpg" }] })
      .mockResolvedValueOnce({ canceled: false, assets: [{ uri: "file://photo-15.jpg" }] });
    mockFileSize.mockImplementation((uri: string) => Number(uri.match(/(\d+)/)?.[1]) * MB);
    mockCreateUploadUrls.mockImplementation(mintSlotPerFile());
    const sending = deferred<unknown>();
    mockUploadAsync.mockReturnValue(sending.promise);
    await renderScreen({ event: openEvent({ usage: { members: 1, storageBytes: String(3 * 1024 ** 3 - 30 * MB) } }) });
    await screen.findByText("Weekend meetup");
    const user = userEvent.setup();
    await user.press(screen.getByRole("button", { name: "Add photos" }));
    expect(await screen.findByText("Developing 1 of 1")).toBeOnTheScreen();

    // 30 MB left on the roll, but 24 MB of it is still on its way.
    await user.press(screen.getByRole("button", { name: "Add photos" }));
    expect(await screen.findByText("No room for these.")).toBeOnTheScreen();
    expect(screen.getByText(/The roll has 6 MB left/)).toBeOnTheScreen();
    expect(mockCreateUploadUrls).toHaveBeenCalledTimes(1);
    sending.resolve({ status: 200, body: "", headers: {} });
    await waitFor(() => expect(mockConfirmUploads).toHaveBeenCalled());
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
    // A finished JS animation is not proof that iOS dismissed its native modal.
    const nativeDismiss = screen.getByTestId("roll-dialog", { includeHiddenElements: true }).props.onDismiss;
    await waitFor(() => expect(screen.queryByTestId("roll-dialog", { includeHiddenElements: true })).toBeNull());
    expect(mockLaunchLibrary).toHaveBeenCalledTimes(1);
    await act(async () => nativeDismiss());
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
        signal: expect.any(Object),
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
  test("saving keeps the open frame on screen, even when the Photos prompt refetches the roll", async () => {
    const photos = [buildPhoto({ id: "photo-3" }), buildPhoto({ id: "photo-2" }), buildPhoto()];
    await renderScreen({ photos });
    const user = userEvent.setup();
    await user.press(await screen.findByLabelText("Frame 2, by You"));
    await fireEvent(screen.getByTestId("frame-viewer-photo"), "display");
    const original = screen.getByTestId("frame-viewer-photo").props.source[0];
    // iOS backgrounds the app for the permission prompt; returning refetches
    // every stale query, and the gallery comes back with re-signed URLs.
    mockRequestMediaPermission.mockImplementation(async () => {
      mockListPhotos.mockResolvedValue({
        data: {
          data: {
            items: photos.map((photo) => ({
              ...photo,
              url: `${photo.url}?resigned`,
              thumbnailUrl: `${photo.thumbnailUrl}?resigned`,
            })),
            nextCursor: null,
          },
        },
      });
      await act(async () => {
        focusManager.setFocused(false);
        focusManager.setFocused(true);
      });
      return { status: "granted" };
    });
    const download = deferred<{ uri: string; delete: typeof mockDeleteDownload }>();
    mockDownloadFile.mockReturnValueOnce(download.promise);
    try {
      await user.press(screen.getByRole("button", { name: "Save to Photos" }));
      await waitFor(() => expect(mockListPhotos).toHaveBeenCalledTimes(2));
      await waitFor(() => expect(mockDownloadFile).toHaveBeenCalledTimes(1));

      // Progress sits over the photo instead of shrinking it.
      expect(screen.getByTestId("frame-viewer-status")).toHaveStyle({ position: "absolute" });
      expect(screen.getByTestId("frame-viewer-photo").props.source[0]).toEqual(original);
      await act(async () => download.resolve({ uri: "file://temporary.jpg", delete: mockDeleteDownload }));
      expect(await screen.findByText("Saved to Photos.")).toBeOnTheScreen();

      // The same image, from the same request: nothing reloads, and the thumbnail is still underneath.
      expect(screen.getByTestId("frame-viewer-photo").props.source[0]).toEqual(original);
      expect(screen.getByTestId("frame-viewer-thumbnail").props.source[0].cacheKey).toBe("photo:photo-2:thumbnail");
      expect(screen.queryByLabelText("Loading frame")).not.toBeOnTheScreen();
      expect(screen.queryByText("Couldn’t load this frame.")).not.toBeOnTheScreen();
      // Neighbours that mount later pick up the fresh URLs.
      expect(
        screen.getByTestId("frame-original-photo-3", { includeHiddenElements: true }).props.source[0].cacheKey,
      ).toBe("photo:photo-3:original");
    } finally {
      focusManager.setFocused(undefined);
    }
  });

  test.each([
    ["image/jpeg", "jpg"],
    ["image/png", "png"],
    ["image/webp", "webp"],
    ["image/heic", "heic"],
    ["image/heif", "heif"],
  ] as const)("saves %s originals under a local .%s filename through Asset.create", async (contentType, suffix) => {
    await renderScreen({ photos: [buildPhoto({ contentType, url: "https://bucket/original-key-without-extension" })] });
    const user = userEvent.setup();
    await user.press(await screen.findByLabelText("Frame 1, by You"));
    await user.press(screen.getByRole("button", { name: "Save to Photos" }));
    expect(await screen.findByText("Saved to Photos.")).toBeOnTheScreen();
    expect(mockCreateAsset).toHaveBeenCalledWith(temporaryFile("photo-1", suffix));
    expect(mockDeleteDownload).toHaveBeenCalledTimes(1);
  });

  test("Save all continues after a library write fails and cleans both temporary files", async () => {
    await renderScreen({ photos: [buildPhoto({ id: "photo-2" }), buildPhoto()] });
    mockCreateAsset.mockRejectedValueOnce(new Error("library write failed"));
    await userEvent.setup().press(await screen.findByRole("button", { name: "Save all frames to Photos" }));
    await userEvent.setup().press(await screen.findByRole("checkbox", { name: "Include 2 you added" }));
    await userEvent.setup().press(screen.getByRole("button", { name: "Save 2" }));
    await act(async () => screen.getByTestId("save-roll-dialog", { includeHiddenElements: true }).props.onDismiss());
    expect(await screen.findByText("1 of 2 saved. The rest didn’t save; try again.")).toBeOnTheScreen();
    expect(mockCreateAsset).toHaveBeenCalledTimes(2);
    expect(mockDeleteDownload).toHaveBeenCalledTimes(2);
  });

  test("renews a failed original automatically once, then offers manual retry if the new URL also fails", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    try {
      await renderScreen({ photos: [buildPhoto()] });
      const user = userEvent.setup();
      await user.press(await screen.findByLabelText("Frame 1, by You"));
      expect(screen.getByLabelText("Loading frame")).toBeOnTheScreen();
      await fireEvent(screen.getByTestId("frame-viewer-photo"), "display");
      expect(screen.queryByLabelText("Loading frame")).not.toBeOnTheScreen();
      const refreshed = buildPhoto({ url: "https://cdn.example.com/original?renewed" });
      mockFindPhoto.mockResolvedValue({ data: { data: refreshed } });
      const listFetches = mockListPhotos.mock.calls.length;
      await fireEvent(screen.getByTestId("frame-viewer-photo"), "error", {
        nativeEvent: { error: "Failed https://private-bucket/photo?signature=secret" },
      });
      await waitFor(() => expect(screen.getByTestId("frame-viewer-photo").props.source[0].uri).toBe(refreshed.url));
      expect(screen.getByLabelText("Loading frame")).toBeOnTheScreen();
      expect(screen.queryByText("Couldn’t load this frame.")).not.toBeOnTheScreen();
      expect(warn).not.toHaveBeenCalled();
      const readsAfterRenewal = mockFindPhoto.mock.calls.length;
      await fireEvent(screen.getByTestId("frame-viewer-photo"), "error", { nativeEvent: { error: "network" } });
      expect(screen.getByText("Couldn’t load this frame.")).toBeOnTheScreen();
      expect(screen.queryByTestId("frame-viewer-photo")).not.toBeOnTheScreen();
      expect(warn).toHaveBeenCalledWith("photo.viewer.load_failed", { photoId: "photo-1", reason: "image_error" });
      expect(mockFindPhoto).toHaveBeenCalledTimes(readsAfterRenewal);

      await user.press(screen.getByRole("button", { name: "Try again" }));
      await waitFor(() => expect(screen.getByTestId("frame-viewer-photo").props.source[0].uri).toBe(refreshed.url));
      expect(screen.getByLabelText("Loading frame")).toBeOnTheScreen();
      // Only the open frame's link is renewed; the roll's pages aren't fetched again.
      expect(mockFindPhoto).toHaveBeenCalledWith(expect.objectContaining({ path: { photoId: "photo-1" } }));
      expect(mockListPhotos).toHaveBeenCalledTimes(listFetches);
      await fireEvent(screen.getByTestId("frame-viewer-photo"), "display");
      expect(screen.queryByLabelText("Loading frame")).not.toBeOnTheScreen();
      await user.press(screen.getByRole("button", { name: "Save to Photos" }));
      await waitFor(() =>
        expect(mockDownloadFile).toHaveBeenCalledWith(
          refreshed.url,
          expect.objectContaining({ uri: temporaryFile("photo-1") }),
          { idempotent: true },
        ),
      );

      // The renewed link replaced the old one on the roll, so the frame opens with it next time.
      const dismissViewer = screen.getByTestId("frame-viewer-dialog").props.onDismiss;
      await user.press(screen.getByRole("button", { name: "Close frame" }));
      await act(async () => dismissViewer());
      await user.press(screen.getByLabelText("Frame 1, by You"));
      expect(screen.getByTestId("frame-viewer-photo").props.source[0].uri).toBe(refreshed.url);
    } finally {
      warn.mockRestore();
    }
  });

  test("a failed URL refresh stays recoverable, and a retry finishing after Close never reopens the viewer", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    try {
      await renderScreen({ photos: [buildPhoto()] });
      const user = userEvent.setup();
      await user.press(await screen.findByLabelText("Frame 1, by You"));
      mockFindPhoto.mockRejectedValueOnce(new Error("offline"));
      await fireEvent(screen.getByTestId("frame-viewer-photo"), "error", { nativeEvent: { error: "network" } });
      expect(await screen.findByText("Couldn’t load this frame.")).toBeOnTheScreen();
      mockFindPhoto.mockRejectedValueOnce(new Error("offline"));
      await user.press(screen.getByRole("button", { name: "Try again" }));
      await waitFor(() => expect(screen.getByRole("button", { name: "Try again" })).toBeEnabled());
      expect(screen.getByText("Couldn’t load this frame.")).toBeOnTheScreen();
      const pending = deferred<{ data: { data: ReturnType<typeof buildPhoto> } }>();
      mockFindPhoto.mockReturnValueOnce(pending.promise);
      await user.press(screen.getByRole("button", { name: "Try again" }));
      const dismissViewer = screen.getByTestId("frame-viewer-dialog").props.onDismiss;
      await user.press(screen.getByRole("button", { name: "Close frame" }));
      await act(async () => dismissViewer());
      pending.resolve({
        data: { data: buildPhoto({ url: "https://cdn.example.com/renewed" }) },
      });
      await waitFor(() => expect(screen.getByLabelText("Frame 1, by You")).toBeOnTheScreen());
      expect(screen.queryByTestId("frame-viewer-photo")).not.toBeOnTheScreen();
      expect(screen.queryByLabelText("Loading frame")).not.toBeOnTheScreen();
    } finally {
      warn.mockRestore();
    }
  });

  test("Save all saves every frame to Photos", async () => {
    await renderScreen({
      photos: [buildPhoto({ id: "photo-2", url: "https://cdn.example.com/2.jpg" }), buildPhoto()],
    });
    await screen.findByLabelText("Frame 2, by You");
    await userEvent.setup().press(screen.getByRole("button", { name: "Save all frames to Photos" }));

    await userEvent.setup().press(await screen.findByRole("checkbox", { name: "Include 2 you added" }));
    await userEvent.setup().press(screen.getByRole("button", { name: "Save 2" }));
    await act(async () => screen.getByTestId("save-roll-dialog", { includeHiddenElements: true }).props.onDismiss());
    expect(await screen.findByText("2 frames saved to Photos.")).toBeOnTheScreen();
    expect(mockDownloadFile).toHaveBeenCalledWith(
      "https://cdn.example.com/2.jpg",
      expect.objectContaining({ uri: temporaryFile("photo-2") }),
      { idempotent: true },
    );
    expect(mockCreateAsset).toHaveBeenCalledTimes(2);
    // The library keeps its own copy, so the downloads don't pile up in the cache.
    expect(mockDeleteDownload).toHaveBeenCalledTimes(2);
  });

  test("saving asks only to add to Photos, and says so when that's refused", async () => {
    await renderScreen({ photos: oneFrame });
    mockRequestMediaPermission.mockResolvedValue({ status: "denied" });
    await saveAll(userEvent.setup());

    expect(await screen.findByText("Allow photo access in Settings to save frames.")).toBeOnTheScreen();
    expect(mockRequestMediaPermission).toHaveBeenCalledWith(true, ["photo"]);
    expect(mockDownloadFile).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /unsaved/ })).not.toBeOnTheScreen();
  });

  test("Save all still saves once the listed links have expired, with a new link for each frame", async () => {
    await renderScreen({
      photos: [
        buildPhoto({ id: "photo-2", url: "https://cdn.example.com/photo-2?expired" }),
        buildPhoto({ url: "https://cdn.example.com/photo-1?expired" }),
      ],
    });
    // S3 refuses an expired link with a 403.
    mockDownloadFile.mockImplementation(async (url: string, destination: { uri: string }) => {
      if (url.endsWith("?expired")) throw new Error("UnableToDownload: response has status 403");
      return { uri: destination.uri, delete: mockDeleteDownload };
    });
    mockFindPhoto.mockImplementation(async ({ path }: { path: { photoId: string } }) => ({
      data: { data: buildPhoto({ id: path.photoId, url: `https://cdn.example.com/${path.photoId}?renewed` }) },
    }));
    await saveAll(userEvent.setup());

    expect(await screen.findByText("2 frames saved to Photos.")).toBeOnTheScreen();
    expect(mockFindPhoto).toHaveBeenCalledWith(expect.objectContaining({ path: { photoId: "photo-2" } }));
    expect(mockFindPhoto).toHaveBeenCalledWith(expect.objectContaining({ path: { photoId: "photo-1" } }));
    expect(mockCreateAsset).toHaveBeenCalledTimes(2);
    // Save all reads the roll once; each frame's link is renewed on its own, only when it's refused.
    expect(mockListPhotos).toHaveBeenCalledTimes(2);
  });

  test("Save all downloads fresh links as listed, with no read per frame", async () => {
    await renderScreen({ photos: [buildPhoto({ id: "photo-2" }), buildPhoto()] });
    await saveAll(userEvent.setup());

    expect(await screen.findByText("2 frames saved to Photos.")).toBeOnTheScreen();
    expect(mockFindPhoto).not.toHaveBeenCalled();
  });

  test("trying Save all again saves only the frames that didn't save, then starts over", async () => {
    await renderScreen({
      photos: [
        buildPhoto({ id: "photo-3", url: "https://cdn.example.com/3.jpg" }),
        buildPhoto({ id: "photo-2", url: "https://cdn.example.com/2.jpg" }),
        buildPhoto(),
      ],
    });
    mockCreateAsset.mockRejectedValueOnce(new Error("library write failed"));
    const user = userEvent.setup();
    await saveAll(user);
    expect(await screen.findByText("2 of 3 saved. The rest didn’t save; try again.")).toBeOnTheScreen();
    expect(mockCreateAsset).toHaveBeenCalledTimes(3);

    mockDownloadFile.mockClear();
    await saveAll(user);
    expect(await screen.findByText("Saved to Photos.")).toBeOnTheScreen();
    expect(mockDownloadFile).toHaveBeenCalledTimes(1);
    expect(mockDownloadFile).toHaveBeenCalledWith(
      "https://cdn.example.com/3.jpg",
      expect.objectContaining({ uri: temporaryFile("photo-3") }),
      { idempotent: true },
    );

    mockDownloadFile.mockClear();
    await saveAll(user);
    expect(await screen.findByText("3 frames saved to Photos.")).toBeOnTheScreen();
    expect(mockDownloadFile).toHaveBeenCalledTimes(3);
  });

  test("the viewer's Save waits while Save all runs", async () => {
    await renderScreen({ photos: [buildPhoto({ id: "photo-2" }), buildPhoto()] });
    const firstDownload = deferred<void>();
    mockDownloadFile.mockImplementationOnce(async (_url: string, destination: { uri: string }) => {
      await firstDownload.promise;
      return { uri: destination.uri, delete: mockDeleteDownload };
    });
    const user = userEvent.setup();
    await saveAll(user);
    expect(await screen.findByRole("button", { name: "Save all frames to Photos" })).toBeDisabled();
    expect(screen.getAllByText("Saving 0 of 2").length).toBeGreaterThan(0);

    await user.press(screen.getByLabelText("Frame 2, by You"));
    expect(screen.getByRole("button", { name: "Save to Photos" })).toBeDisabled();

    firstDownload.resolve();
    await waitFor(() => expect(screen.getByRole("button", { name: "Save to Photos" })).toBeEnabled());
    expect(mockDownloadFile).toHaveBeenCalledTimes(2);
  });

  test("a missing thumbnail stays a tappable placeholder and never preloads an original", async () => {
    await renderScreen({ photos: [buildPhoto()] });
    await fireEvent(await screen.findByTestId("contact-frame-photo"), "error", { nativeEvent: { error: "not ready" } });
    expect(screen.queryByTestId("contact-frame-photo")).not.toBeOnTheScreen();
    expect(screen.queryByTestId("frame-viewer-photo")).not.toBeOnTheScreen();
    expect(mockDownloadFile).not.toHaveBeenCalled();
    await userEvent.setup().press(screen.getByLabelText("Frame 1, by You"));
    expect(screen.getByTestId("frame-viewer-photo").props.source[0].uri).toBe(buildPhoto().url);
    const dismissViewer = screen.getByTestId("frame-viewer-dialog").props.onDismiss;
    await userEvent.setup().press(screen.getByRole("button", { name: "Close frame" }));
    expect(screen.queryByTestId("frame-viewer-photo")).not.toBeOnTheScreen();
    await act(async () => dismissViewer());
    expect(screen.queryByTestId("frame-viewer-dialog", { includeHiddenElements: true })).not.toBeOnTheScreen();
    await userEvent.setup().press(screen.getByLabelText("Frame 1, by You"));
    expect(screen.getByTestId("frame-viewer-photo").props.source[0].uri).toBe(buildPhoto().url);
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
    await waitFor(() => expect(mockCreateAsset).toHaveBeenCalledWith(temporaryFile("photo-1")));

    mockDetailResponses({ photos: [] });
    await user.press(screen.getAllByRole("button", { name: "More" })[0]);
    await user.press(screen.getByRole("button", { name: "Delete for everyone" }));
    await act(async () => screen.getByTestId("frame-menu-dialog", { includeHiddenElements: true }).props.onDismiss());
    await user.press(await screen.findByRole("button", { name: "Delete it" }));

    await waitFor(() =>
      expect(mockRemovePhoto).toHaveBeenCalledWith(
        expect.objectContaining({ path: { photoId: "photo-1" }, throwOnError: true }),
      ),
    );
    expect(await screen.findByText("Frame deleted.")).toBeOnTheScreen();
  });

  test("a guest can't delete someone else's frame", async () => {
    mockUser = { id: "user-2" };
    await renderScreen({ participants: [host, guest], photos: [buildPhoto({ addedById: "user-1" })] });
    await userEvent.setup().press(await screen.findByLabelText("Frame 1, by Ada"));
    expect(screen.getByRole("button", { name: "Save to Photos" })).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Delete for everyone" })).not.toBeOnTheScreen();
  });
});

describe("people and the menu", () => {
  test("a guest leaves the roll from the menu", async () => {
    mockUser = { id: "user-2" };
    const client = await renderScreen({ participants: [host, guest], photos: oneFrame });
    const user = userEvent.setup();
    await user.press(await screen.findByRole("button", { name: "Roll menu" }));
    await user.press(screen.getByRole("button", { name: "Leave the roll" }));
    const requests = [
      mockFindOne.mock.calls.length,
      mockListPhotos.mock.calls.length,
      mockGetParticipants.mock.calls.length,
    ];
    mockLeave.mockImplementation(async () => {
      const forbidden = createApiError("Membership is gone", { code: "FORBIDDEN", status: 403 });
      mockFindOne.mockRejectedValue(forbidden);
      mockListPhotos.mockRejectedValue(forbidden);
      mockGetParticipants.mockRejectedValue(forbidden);
      return {};
    });
    await user.press(await screen.findByRole("button", { name: "Leave" }));

    await waitFor(() => expect(mockLeave).toHaveBeenCalledWith({ path: { eventId: "event-1" }, throwOnError: true }));
    expect(mockReplace).toHaveBeenCalledWith("/events");
    expect([
      mockFindOne.mock.calls.length,
      mockListPhotos.mock.calls.length,
      mockGetParticipants.mock.calls.length,
    ]).toEqual(requests);
    expect(client.getQueryData(eventsKeys.detail("event-1"))).toBeUndefined();
    expect(client.getQueryData(eventsKeys.photos("event-1"))).toBeUndefined();
    expect(client.getQueryData(eventsKeys.participants("event-1"))).toBeUndefined();
    expect(Alert.alert).not.toHaveBeenCalled();
    // The evicted roll stays on screen until Home replaces it: no loading spinner in between.
    expect(screen.queryByLabelText("Loading")).not.toBeOnTheScreen();
    expect(screen.getByText("Weekend meetup")).toBeOnTheScreen();
    expect(screen.getByLabelText("Frame 1, by Ada")).toBeOnTheScreen();
  });

  test("a failed Leave restores readers so the member can refresh and keep using the roll", async () => {
    mockUser = { id: "user-2" };
    await renderScreen({ participants: [host, guest], photos: oneFrame });
    mockLeave.mockRejectedValueOnce(createApiError("Could not leave", { status: 500 }));
    const user = userEvent.setup();
    await user.press(await screen.findByRole("button", { name: "Roll menu" }));
    await user.press(screen.getByRole("button", { name: "Leave the roll" }));
    await user.press(await screen.findByRole("button", { name: "Leave" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Leave" })).not.toBeOnTheScreen());
    expect(mockReplace).not.toHaveBeenCalled();
    mockFindOne.mockResolvedValue({ data: { data: openEvent({ title: "Still joined" }) } });
    await fireEvent(screen.getByTestId("event-detail-refresh"), "refresh");
    expect(await screen.findByText("Still joined")).toBeOnTheScreen();
    expect(screen.getByLabelText("Frame 1, by Ada")).toBeOnTheScreen();
  });

  test("Roll call from the menu swaps the same sheet to the roll call", async () => {
    mockUser = { id: "user-2" };
    await renderScreen({ participants: [host, guest], photos: oneFrame });
    const user = userEvent.setup();
    await user.press(await screen.findByRole("button", { name: "Roll menu" }));
    await user.press(screen.getByRole("button", { name: "Roll call" }));

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

  test("the host menu lists envelope, roll call, settings, cut and leave", async () => {
    await renderScreen({ photos: oneFrame });
    const user = userEvent.setup();
    await user.press(await screen.findByRole("button", { name: "Roll menu" }));

    expect(screen.getByRole("button", { name: "Send the envelope" })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Roll call" })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Roll settings" })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Cut the roll now" })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Leave the roll" })).toBeOnTheScreen();
  });

  test("a host sends the envelope from the menu", async () => {
    await renderScreen({ photos: oneFrame });
    const user = userEvent.setup();
    await user.press(await screen.findByRole("button", { name: "Roll menu" }));
    await user.press(screen.getByRole("button", { name: "Send the envelope" }));
    expect(mockPush).toHaveBeenCalledWith("/events/event-1/envelope");
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

test("the focused tray keeps uploaded rows through refresh, then navigation starts a fresh visit", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  clients.push(client);
  mockDetailResponses();
  mockCreateUploadUrls.mockImplementation(mintSlotPerFile());
  const upload = deferred<{ status: number; body: string; headers: object }>();
  mockUploadAsync.mockReturnValueOnce(upload.promise);
  const content = () => (
    <QueryClientProvider client={client}>
      <UploadTrayScreen />
    </QueryClientProvider>
  );
  const view = await render(content());
  const picked = (key: string) => ({
    key,
    name: key,
    uri: `file://${key}.jpg`,
    contentType: "image/jpeg" as const,
    sizeBytes: IMAGE_BYTES.length,
    status: { kind: "waiting" as const },
  });
  const completed = buildPhoto({ id: "photo-new-1" });
  const refresh = async () => {
    mockListPhotos.mockResolvedValue({ data: { data: { items: [completed], nextCursor: null } } });
    await client.invalidateQueries({ queryKey: eventsKeys.photos("event-1") });
  };
  await act(async () => {
    addToTray("event-1", [picked("First")], refresh);
  });
  await waitFor(() => expect(mockUploadAsync).toHaveBeenCalledTimes(1));
  await act(async () => upload.resolve({ status: 200, body: "", headers: {} }));
  await waitFor(() => expect(screen.getByLabelText("First, Developed")).toBeOnTheScreen());
  expect(screen.queryByText("The tray is empty.")).not.toBeOnTheScreen();
  expect(screen.getByRole("header", { name: /In the tray/ })).toHaveTextContent("In the tray\n1 of 1 developed");
  expect(screen.getByTestId("tray-row-photo", { includeHiddenElements: true }).props.source).toEqual([
    { uri: completed.thumbnailUrl, cacheKey: `photo:${completed.id}:thumbnail` },
  ]);

  // Focus cleanup also runs on a system back gesture, without requiring a button handler.
  mockTrayFocused = false;
  await view.rerender(content());
  const nextUpload = deferred<{ status: number; body: string; headers: object }>();
  mockUploadAsync.mockReturnValueOnce(nextUpload.promise);
  await act(async () => {
    addToTray("event-1", [picked("Next")], refresh);
  });
  mockTrayFocused = true;
  await view.rerender(content());
  expect(screen.queryByLabelText(/First,/)).not.toBeOnTheScreen();
  expect(screen.getByLabelText(/Next,/)).toBeOnTheScreen();
  await act(async () => nextUpload.resolve({ status: 200, body: "", headers: {} }));
  await waitFor(() => expect(screen.getByText("1 of 1 developed")).toBeOnTheScreen());
});

test.each([
  ["suspended", { status: "SUSPENDED" as const }],
  ["closed", { galleryState: "CLOSED" as const }],
  ["upcoming", { galleryState: "UPCOMING" as const }],
])("the %s roll's tray never requests or displays cached or local photo previews", async (_name, state) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  clients.push(client);
  const event = openEvent(state);
  mockFindOne.mockResolvedValue({ data: { data: event } });
  client.setQueryData(eventsKeys.detail("event-1"), event);
  client.setQueryData(eventsKeys.photos("event-1"), oneFrame);
  addToTray(
    "event-1",
    [
      {
        key: "local",
        name: "Local",
        uri: "file://private.jpg",
        contentType: "image/jpeg",
        sizeBytes: 3,
        status: { kind: "failed", reason: "interrupted" },
      },
    ],
    async () => undefined,
  );
  await render(
    <QueryClientProvider client={client}>
      <UploadTrayScreen />
    </QueryClientProvider>,
  );
  expect(await screen.findByLabelText("Local, Didn’t take · interrupted")).toBeOnTheScreen();
  expect(mockListPhotos).not.toHaveBeenCalled();
  expect(screen.queryAllByTestId("tray-row-photo", { includeHiddenElements: true })).toHaveLength(0);
});

describe("chapter 09 gallery", () => {
  const mixed = [buildPhoto({ id: "mine", addedById: "user-2" }), buildPhoto({ id: "theirs", addedById: "user-1" })];
  const mixedWithUrls = mixed.map((photo) => ({ ...photo, url: `https://cdn.example.com/${photo.id}.jpg` }));
  const threeWithUrls = ["c", "b", "a"].map((id) => buildPhoto({ id, url: `https://cdn.example.com/${id}.jpg` }));
  const selectMixed = async () => {
    const user = userEvent.setup();
    await user.longPress(await screen.findByLabelText("Frame 2, by You"));
    await user.press(screen.getByLabelText("Frame 1, by Ada"));
    return user;
  };

  test("guest selection marks both frames but deletion only targets their own", async () => {
    mockUser = { id: "user-2" };
    await renderScreen({ photos: mixed, participants: [host, guest] });
    const user = await selectMixed();
    expect(screen.getByText("2 marked · 1 yours")).toBeOnTheScreen();
    expect(screen.getByLabelText("Frame 2, by You")).toBeSelected();
    await user.press(screen.getByRole("button", { name: "Delete 1" }));
    expect(screen.getByText("Delete this frame for everyone?")).toBeOnTheScreen();
    await user.press(screen.getByRole("button", { name: "Delete it" }));
    await waitFor(() => expect(mockRemovePhoto).toHaveBeenCalledTimes(1));
    expect(mockRemovePhoto).toHaveBeenCalledWith(expect.objectContaining({ path: { photoId: "mine" } }));
    expect(await screen.findByText("1 marked · 0 yours")).toBeOnTheScreen();
  });

  test("host partial deletion keeps failed frames marked for retry", async () => {
    await renderScreen({ photos: mixed, participants: [host, guest] });
    const user = userEvent.setup();
    await user.longPress(await screen.findByLabelText("Frame 2, by Grace"));
    await user.press(screen.getByLabelText("Frame 1, by You"));
    mockRemovePhoto.mockRejectedValueOnce(createApiError("Refused", { status: 403 }));
    await user.press(screen.getByRole("button", { name: "Delete 2" }));
    await user.press(screen.getByRole("button", { name: "Delete it" }));
    expect(await screen.findByText("One frame couldn’t be deleted. Try again.")).toBeOnTheScreen();
    expect(screen.getByText("1 marked · host")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Delete 1" })).toBeEnabled();
  });

  test("save-all excludes own uploads by default and retries only failed files", async () => {
    mockUser = { id: "user-2" };
    await renderScreen({ photos: mixedWithUrls, participants: [host, guest] });
    const user = userEvent.setup();
    await user.press(await screen.findByRole("button", { name: "Save all frames to Photos" }));
    expect(await screen.findByRole("checkbox", { name: "Include 1 you added" })).not.toBeChecked();
    expect(screen.getByText("Save this frame?")).toBeOnTheScreen();
    await user.press(screen.getByRole("checkbox", { name: "Include 1 you added" }));
    mockCreateAsset.mockRejectedValueOnce(new Error("full"));
    await user.press(screen.getByRole("button", { name: "Save 2" }));
    await act(async () => screen.getByTestId("save-roll-dialog", { includeHiddenElements: true }).props.onDismiss());
    await user.press(await screen.findByRole("button", { name: "Retry 1 unsaved" }));
    expect(await screen.findByText("Saved to Photos.")).toBeOnTheScreen();
    expect(mockCreateAsset).toHaveBeenCalledTimes(3);
    // Fresh links download as listed, and the retry downloads only the frame that didn't save.
    expect(mockDownloadFile.mock.calls.map(([url]) => url)).toEqual([
      "https://cdn.example.com/mine.jpg",
      "https://cdn.example.com/theirs.jpg",
      "https://cdn.example.com/mine.jpg",
    ]);
    expect(mockFindPhoto).not.toHaveBeenCalled();
    expect(mockRequestMediaPermission).toHaveBeenCalledWith(true, ["photo"]);
    expect(screen.queryByRole("button", { name: /unsaved/ })).not.toBeOnTheScreen();
  });

  test("saving one frame from the viewer keeps what Save all didn't save, and never saves a frame twice", async () => {
    await renderScreen({ photos: threeWithUrls });
    mockCreateAsset
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error("full"))
      .mockRejectedValueOnce(new Error("full"));
    const user = userEvent.setup();
    await saveAll(user);
    expect(await screen.findByText("1 of 3 saved. The rest didn’t save; try again.")).toBeOnTheScreen();

    // Saved on its own: it leaves the list, and the other frame stays unsaved.
    mockDownloadFile.mockClear();
    await user.press(screen.getByLabelText("Frame 2, by You"));
    await user.press(screen.getByRole("button", { name: "Save to Photos" }));
    expect(await screen.findByText("Saved to Photos.")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Retry 1 unsaved" })).toBeOnTheScreen();
    expect(mockDownloadFile.mock.calls.map(([url]) => url)).toEqual(["https://cdn.example.com/b.jpg"]);

    mockDownloadFile.mockClear();
    await user.press(screen.getByRole("button", { name: "Retry 1 unsaved" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: /unsaved/ })).not.toBeOnTheScreen());
    expect(mockDownloadFile.mock.calls.map(([url]) => url)).toEqual(["https://cdn.example.com/a.jpg"]);
  });

  test("a frame deleted since the roll loaded leaves the unsaved list instead of failing forever", async () => {
    await renderScreen({ photos: threeWithUrls });
    // Its object is gone, and the API no longer finds it.
    mockDownloadFile.mockImplementation(async (url: string, destination: { uri: string }) => {
      if (url.endsWith("/b.jpg")) throw new Error("UnableToDownload: response has status 403");
      return { uri: destination.uri, delete: mockDeleteDownload };
    });
    mockFindPhoto.mockRejectedValue(createApiError("Photo not found", { status: 404 }));
    mockCreateAsset.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error("full"));
    const user = userEvent.setup();
    await saveAll(user);

    expect(await screen.findByText("1 of 2 saved. The rest didn’t save; try again.")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Retry 1 unsaved" })).toBeOnTheScreen();
    expect(screen.queryByLabelText("Frame 2, by You")).not.toBeOnTheScreen();
    expect(screen.getByLabelText("Frame 3, by You")).toBeOnTheScreen();
    expect(screen.getByLabelText("Frame 1, by You")).toBeOnTheScreen();
  });

  test("Retry N unsaved can be let go", async () => {
    await renderScreen({ photos: [buildPhoto({ id: "photo-2" }), buildPhoto()] });
    mockCreateAsset.mockRejectedValueOnce(new Error("full"));
    const user = userEvent.setup();
    await saveAll(user);
    await user.press(await screen.findByRole("button", { name: "Dismiss unsaved frames" }));
    expect(screen.queryByRole("button", { name: "Retry 1 unsaved" })).not.toBeOnTheScreen();

    // Nothing is remembered: Save all starts over.
    mockDownloadFile.mockClear();
    await saveAll(user);
    expect(await screen.findByText("2 frames saved to Photos.")).toBeOnTheScreen();
    expect(mockDownloadFile).toHaveBeenCalledTimes(2);
  });

  test("denied library permission makes no download and leaves Save ready to ask again", async () => {
    await renderScreen({ photos: oneFrame });
    mockRequestMediaPermission.mockResolvedValue({ status: "denied", granted: false });
    const user = userEvent.setup();
    await user.press(await screen.findByLabelText("Frame 1, by You"));
    await user.press(screen.getByRole("button", { name: "Save to Photos" }));
    expect(await screen.findByText("Allow photo access in Settings to save frames.")).toBeOnTheScreen();
    expect(mockDownloadFile).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /unsaved/ })).not.toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Save to Photos" })).toBeEnabled();
  });

  test("tapping the strip swaps frames and updates attribution without downloading", async () => {
    await renderScreen({ photos: mixed, participants: [host, guest] });
    const user = userEvent.setup();
    await user.press(await screen.findByLabelText("Frame 2, by Grace"));
    expect(screen.getByText("Grace Hopper")).toBeOnTheScreen();
    expect(screen.getByTestId("frame-viewer-photo").props.source[0].cacheKey).toBe("photo:mine:original");
    await user.press(
      within(screen.getByTestId("viewer-film-strip")).getByRole("imagebutton", { name: "Frame 1, by You" }),
    );
    expect(screen.getByText("Ada Lovelace")).toBeOnTheScreen();
    expect(screen.getByTestId("frame-viewer-photo").props.source[0].cacheKey).toBe("photo:theirs:original");
    expect(screen.getAllByTestId("frame-viewer-photo")).toHaveLength(1);
    expect(mockDownloadFile).not.toHaveBeenCalled();
  });

  test("swiping moves attribution and the strip with the frame, with its neighbour's original preloaded", async () => {
    await renderScreen({ photos: mixed, participants: [host, guest] });
    const user = userEvent.setup();
    await user.press(await screen.findByLabelText("Frame 2, by Grace"));
    const stride = Dimensions.get("window").width + PAGE_GAP;
    expect(screen.getByText("Grace Hopper")).toBeOnTheScreen();
    expect(screen.getAllByTestId("frame-viewer-photo")).toHaveLength(1);
    expect(screen.getByTestId("frame-original-theirs", { includeHiddenElements: true }).props.source[0].cacheKey).toBe(
      "photo:theirs:original",
    );
    const swipe = async (translationX: number, velocityX: number) =>
      act(async () => {
        fireGestureHandler(getByGestureTestId("frame-viewer-pan"), [
          { state: State.BEGAN, translationX: 0, translationY: 0 },
          { state: State.ACTIVE, translationX: Math.sign(translationX) * 10, translationY: 0 },
          { translationX, translationY: 0 },
          { state: State.END, translationX, translationY: 0, velocityX, velocityY: 0 },
        ]);
      });

    await swipe(-stride * 0.6, -200);
    await waitFor(() => expect(screen.getByText("Ada Lovelace")).toBeOnTheScreen());
    expect(
      within(screen.getByTestId("viewer-film-strip")).getByRole("imagebutton", { name: "Frame 1, by You" }),
    ).toBeSelected();
    expect(screen.getAllByTestId("frame-viewer-photo")).toHaveLength(1);
    expect(screen.getByTestId("frame-viewer-photo").props.source[0].cacheKey).toBe("photo:theirs:original");

    await swipe(stride * 0.15, 1500);
    await waitFor(() => expect(screen.getByText("Grace Hopper")).toBeOnTheScreen());
    expect(screen.getByTestId("frame-viewer-photo").props.source[0].cacheKey).toBe("photo:mine:original");
    expect(mockDownloadFile).not.toHaveBeenCalled();
  });

  test("suspension closes an open viewer and cancels a download before it reaches Photos", async () => {
    const client = await renderScreen({ photos: oneFrame });
    const download = deferred<{ uri: string; delete: typeof mockDeleteDownload }>();
    mockDownloadFile.mockReturnValueOnce(download.promise);
    const user = userEvent.setup();
    await user.press(await screen.findByLabelText("Frame 1, by You"));
    await user.press(screen.getByRole("button", { name: "Save to Photos" }));
    await waitFor(() => expect(mockDownloadFile).toHaveBeenCalledTimes(1));
    await act(async () => client.setQueryData(eventsKeys.detail("event-1"), openEvent({ status: "SUSPENDED" })));
    await waitFor(() => expect(screen.queryByTestId("frame-viewer-photo")).not.toBeOnTheScreen());
    await act(async () => download.resolve({ uri: "file://temporary.jpg", delete: mockDeleteDownload }));
    expect(mockCreateAsset).not.toHaveBeenCalled();
    expect(mockDeleteDownload).toHaveBeenCalledTimes(1);
  });

  test("multi-photo sharing passes local files and keeps them until the next share", async () => {
    mockUser = { id: "user-2" };
    await renderScreen({ photos: mixed, participants: [host, guest] });
    const user = await selectMixed();
    await user.press(screen.getByRole("button", { name: "Share" }));
    await waitFor(() => expect(mockSharePhotos).toHaveBeenCalledTimes(1));
    const [{ urls }] = mockSharePhotos.mock.calls[0];
    expect(urls).toEqual([
      expect.stringMatching(/^file:\/\/cache\/everglow-share-mine-\d+\.jpg$/),
      expect.stringMatching(/^file:\/\/cache\/everglow-share-theirs-\d+\.jpg$/),
    ]);
    expect(mockSharePhotos).toHaveBeenCalledWith(expect.objectContaining({ failOnCancel: false }));
    expect(mockRequestMediaPermission).not.toHaveBeenCalled();
    // Android's receiving app may still be reading them after the sheet closes.
    await waitFor(() => expect(screen.getByRole("button", { name: "Share" })).toBeEnabled());
    expect(mockDeleteDownload).not.toHaveBeenCalled();

    // The next share clears them out first.
    await user.press(screen.getByRole("button", { name: "Share" }));
    await waitFor(() => expect(mockSharePhotos).toHaveBeenCalledTimes(2));
    expect(mockDeleteDownload).toHaveBeenCalledTimes(2);
  });

  test("a long share shows how far it has got and can be stopped, opening no share sheet", async () => {
    mockUser = { id: "user-2" };
    await renderScreen({ photos: mixed, participants: [host, guest] });
    const user = await selectMixed();
    const second = deferred<{ uri: string; delete: typeof mockDeleteDownload }>();
    mockDownloadFile
      .mockImplementationOnce(async (_url: string, destination: { uri: string }) => ({
        uri: destination.uri,
        delete: mockDeleteDownload,
      }))
      .mockReturnValueOnce(second.promise);
    await user.press(screen.getByRole("button", { name: "Share" }));
    expect(await screen.findByText("Preparing 1 of 2")).toBeOnTheScreen();
    // An earlier share's leftovers were cleared as this one started.
    const deletedBefore = mockDeleteDownload.mock.calls.length;
    await user.press(screen.getByRole("button", { name: "Stop saving or sharing" }));
    await act(async () => second.resolve({ uri: "file://cache/second.jpg", delete: mockDeleteDownload }));
    expect(mockSharePhotos).not.toHaveBeenCalled();
    // Nothing was shared, so both downloads go at once.
    expect(mockDeleteDownload).toHaveBeenCalledTimes(deletedBefore + 2);
    expect(screen.getByRole("button", { name: "Share" })).toBeEnabled();
  });

  test("select all reads unloaded pages and a later page failure preserves the original selection", async () => {
    mockUser = { id: "user-2" };
    await renderScreen({ photos: mixed, participants: [host, guest] });
    const user = await selectMixed();
    mockListPhotos
      .mockResolvedValueOnce({ data: { data: { items: mixed, nextCursor: "later" } } })
      .mockRejectedValueOnce(new Error("offline"));
    await user.press(screen.getByRole("button", { name: "All" }));
    expect(await screen.findByText("Couldn’t load the frames. Try again.")).toBeOnTheScreen();
    expect(screen.getByText("2 marked · 1 yours")).toBeOnTheScreen();
    mockListPhotos
      .mockResolvedValueOnce({ data: { data: { items: mixed, nextCursor: "later" } } })
      .mockResolvedValueOnce({ data: { data: { items: [buildPhoto({ id: "later" })], nextCursor: null } } });
    await user.press(screen.getByRole("button", { name: "All" }));
    expect(await screen.findByText("3 marked · 1 yours")).toBeOnTheScreen();
  });
});

test("an expired session stops an in-flight save before the library write", async () => {
  await renderScreen({ photos: oneFrame });
  const download = deferred<{ uri: string; delete: typeof mockDeleteDownload }>();
  mockDownloadFile.mockReturnValueOnce(download.promise);
  const user = userEvent.setup();
  await user.press(await screen.findByLabelText("Frame 1, by You"));
  await user.press(screen.getByRole("button", { name: "Save to Photos" }));
  await waitFor(() => expect(mockDownloadFile).toHaveBeenCalledTimes(1));
  await act(async () => runAccountCleared("sessionExpired"));
  await act(async () => download.resolve({ uri: "file://temporary.jpg", delete: mockDeleteDownload }));
  expect(mockCreateAsset).not.toHaveBeenCalled();
  expect(mockDeleteDownload).toHaveBeenCalledTimes(1);
});
