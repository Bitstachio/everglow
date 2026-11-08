// The integration harness supplies the real data provider.
// eslint-disable-next-line no-restricted-imports
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, screen, userEvent, waitFor } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { renderWithI18n } from "@/testing/render";
import PersonFramesScreen from "./person-frames-screen";
import { buildEvent, buildParticipant, buildPhoto } from "../testing/fixtures";

const mockFindOne = jest.fn();
const mockGetParticipants = jest.fn();
const mockListPhotos = jest.fn();
const mockBack = jest.fn();

jest.mock("@/lib/api/generated/client.gen", () => ({ client: { getConfig: () => ({}) } }));
jest.mock("@/lib/api/generated", () => ({
  eventsControllerFindOne: (...args: unknown[]) => mockFindOne(...args),
  eventsControllerGetParticipants: (...args: unknown[]) => mockGetParticipants(...args),
  photosControllerListPhotos: (...args: unknown[]) => mockListPhotos(...args),
}));
jest.mock("@/hooks/use-reduce-motion", () => ({ useReduceMotion: () => true }));
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), back: mockBack, replace: jest.fn(), canGoBack: () => true }),
  useLocalSearchParams: () => ({ id: "event-1", userId: "user-2" }),
}));

const initialMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const leila = buildParticipant({ userId: "user-2", name: "Leila Haddad", accessLevel: "PARTICIPANT" });
// The whole roll, newest first: frames 5 to 1. Leila added frames 4 and 2.
const roll = [
  buildPhoto({ id: "p5", addedById: "user-1" }),
  buildPhoto({ id: "p4", addedById: "user-2" }),
  buildPhoto({ id: "p3", addedById: "user-3" }),
  buildPhoto({ id: "p2", addedById: "user-2" }),
  buildPhoto({ id: "p1", addedById: "user-1" }),
];
const page = (items: ReturnType<typeof buildPhoto>[]) => ({ data: { data: { items, nextCursor: null } } });

/** The person's frames when the query is filtered by uploader; the whole roll otherwise. */
const serve = (theirs: ReturnType<typeof buildPhoto>[]) =>
  mockListPhotos.mockImplementation(({ query }: { query: { addedById?: string } }) =>
    Promise.resolve(page(query.addedById ? theirs : roll)),
  );

const renderScreen = async (event = buildEvent()) => {
  mockFindOne.mockResolvedValue({ data: { data: event } });
  mockGetParticipants.mockResolvedValue({ data: { data: [leila] } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  await renderWithI18n(
    <SafeAreaProvider initialMetrics={initialMetrics}>
      <QueryClientProvider client={client}>
        <PersonFramesScreen />
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
};

beforeEach(() => {
  jest.clearAllMocks();
  mockListPhotos.mockReset();
});

test("shows only their frames, each with its number on the whole roll", async () => {
  serve([roll[1], roll[3]]);
  await renderScreen();

  expect(await screen.findByRole("imagebutton", { name: "Frame 4" })).toBeOnTheScreen();
  expect(screen.getByRole("imagebutton", { name: "Frame 2" })).toBeOnTheScreen();
  expect(screen.queryByRole("imagebutton", { name: "Frame 5" })).not.toBeOnTheScreen();
  // The grid renders its cells in a batch after the first paint.
  await act(() => new Promise((resolve) => setTimeout(resolve, 100)));
  expect(screen.getByText("Leila’s frames")).toBeOnTheScreen();
  expect(screen.getByText("2 frames on the roll")).toBeOnTheScreen();
  expect(mockListPhotos).toHaveBeenCalledWith(
    expect.objectContaining({ path: { eventId: "event-1" }, query: expect.objectContaining({ addedById: "user-2" }) }),
  );
});

test("shows empty frames while loading", async () => {
  mockListPhotos.mockReturnValue(new Promise(() => {}));
  await renderScreen();

  expect(await screen.findByLabelText("Loading Leila’s frames")).toBeOnTheScreen();
  expect(screen.getByTestId("person-frames-loading")).toBeOnTheScreen();
});

test("someone with nothing you can see, such as a person you blocked, has no frames rather than an error", async () => {
  serve([]);
  await renderScreen();

  expect(await screen.findByText("Leila has no frames you can see.")).toBeOnTheScreen();
  expect(screen.queryByRole("button", { name: "Try again" })).not.toBeOnTheScreen();
  expect(screen.queryByRole("imagebutton")).not.toBeOnTheScreen();
});

test("frames that didn't load can be tried again", async () => {
  mockListPhotos.mockImplementation(({ query }: { query: { addedById?: string } }) =>
    query.addedById ? Promise.reject(new Error("Offline")) : Promise.resolve(page(roll)),
  );
  await renderScreen();

  expect(await screen.findByText("Couldn’t load these frames.")).toBeOnTheScreen();
  serve([roll[1]]);
  await userEvent.setup().press(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByRole("imagebutton", { name: "Frame 4" })).toBeOnTheScreen();
});

test("a closed roll asks for no frames", async () => {
  serve([roll[1]]);
  await renderScreen(buildEvent({ galleryState: "CLOSED" }));

  expect(await screen.findByText("This roll has no frames to show.")).toBeOnTheScreen();
  expect(mockListPhotos).not.toHaveBeenCalled();
});

test("Back returns to the roll call", async () => {
  serve([]);
  await renderScreen();

  await userEvent.setup().press(await screen.findByRole("button", { name: "Back" }));
  await waitFor(() => expect(mockBack).toHaveBeenCalled());
});
