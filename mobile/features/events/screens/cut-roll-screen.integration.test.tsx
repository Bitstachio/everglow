import "../testing/native-mocks";
// eslint-disable-next-line no-restricted-imports
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, userEvent, waitFor } from "@testing-library/react-native";
import CutRollScreen from "./cut-roll-screen";
import { buildEvent, buildParticipant, buildPhoto, deferred } from "../testing/fixtures";
// Inspect what the cut refreshes at the integration boundary.
// eslint-disable-next-line no-restricted-imports
import { eventsKeys } from "../api/keys";
import { createApiError } from "@/lib/api/errors";

const mockFindOne = jest.fn();
const mockGetParticipants = jest.fn();
const mockListPhotos = jest.fn();
const mockDeactivate = jest.fn();
const mockBack = jest.fn();
const mockDismissTo = jest.fn();

let mockUser: { id: string } | null = { id: "user-1" };

jest.mock("@/lib/api/generated/client.gen", () => ({ client: { getConfig: () => ({}) } }));
jest.mock("@/lib/api/generated", () => ({
  eventsControllerFindOne: (...args: unknown[]) => mockFindOne(...args),
  eventsControllerGetParticipants: (...args: unknown[]) => mockGetParticipants(...args),
  eventsControllerDeactivate: (...args: unknown[]) => mockDeactivate(...args),
  photosControllerListPhotos: (...args: unknown[]) => mockListPhotos(...args),
}));
jest.mock("@/context/auth-context", () => ({ useAuth: () => ({ user: mockUser }) }));
jest.mock("expo-router", () => ({
  useRouter: () => ({ back: mockBack, dismissTo: mockDismissTo }),
  useLocalSearchParams: () => ({ id: "event-1" }),
}));
jest.mock("@/hooks/use-reduce-motion", () => ({ useReduceMotion: () => true }));

const clients: QueryClient[] = [];

const openRoll = (overrides: Parameters<typeof buildEvent>[0] = {}) =>
  buildEvent({ galleryState: "OPEN", photoCount: 148, usage: { members: 24, storageBytes: "0" }, ...overrides });

const renderScreen = async ({
  event = openRoll(),
  participants = [buildParticipant()],
  photos = [buildPhoto({ id: "photo-1" }), buildPhoto({ id: "photo-2" })],
} = {}) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: 0 } },
  });
  clients.push(client);
  mockFindOne.mockResolvedValue({ data: { data: event } });
  mockGetParticipants.mockResolvedValue({ data: { data: participants } });
  mockListPhotos.mockResolvedValue({ data: { data: { items: photos, nextCursor: null } } });
  await render(
    <QueryClientProvider client={client}>
      <CutRollScreen />
    </QueryClientProvider>,
  );
  return client;
};

beforeEach(() => {
  mockUser = { id: "user-1" };
  mockFindOne.mockReset();
  mockGetParticipants.mockReset();
  mockListPhotos.mockReset();
  mockDeactivate.mockReset();
  mockBack.mockReset();
  mockDismissTo.mockReset();
});

afterEach(() => {
  clients.splice(0).forEach((client) => client.clear());
});

test("says what goes now and what stays", async () => {
  await renderScreen();

  expect(await screen.findByText("Hosts only")).toBeOnTheScreen();
  expect(screen.getByRole("header", { name: "Cut the roll\nnow?" })).toBeOnTheScreen();
  expect(screen.getByLabelText("Now, Nobody can add photos or join")).toBeOnTheScreen();
  expect(screen.getByLabelText("At once, All 148 photos are removed")).toBeOnTheScreen();
  expect(screen.getByLabelText("Stays, The event and its 24 people")).toBeOnTheScreen();
  expect(screen.getByText("Can’t be undone · save the roll first ↓")).toBeOnTheScreen();
  expect(screen.getByRole("button", { name: "Cut it and remove 148 photos" })).toBeOnTheScreen();
  expect(screen.getByRole("button", { name: "Keep it open" })).toBeOnTheScreen();
  // The strip shows the roll's latest photos.
  expect(mockListPhotos).toHaveBeenCalledWith(expect.objectContaining({ query: { limit: 4 } }));
});

test("cuts through the deactivate call, refreshes the roll and goes back to it with the count", async () => {
  const client = await renderScreen();
  mockDeactivate.mockResolvedValue({ data: { data: openRoll({ galleryState: "CLOSED" }) } });
  const invalidate = jest.spyOn(client, "invalidateQueries");
  await userEvent.setup().press(await screen.findByRole("button", { name: "Cut it and remove 148 photos" }));

  await waitFor(() =>
    expect(mockDismissTo).toHaveBeenCalledWith({ pathname: "/events/[id]", params: { id: "event-1", cut: "148" } }),
  );
  expect(mockDeactivate).toHaveBeenCalledWith({ path: { eventId: "event-1" }, throwOnError: true });
  expect(invalidate).toHaveBeenCalledWith({ queryKey: eventsKeys.all });
  expect(invalidate).toHaveBeenCalledWith({ queryKey: eventsKeys.detail("event-1") });
  expect(invalidate).toHaveBeenCalledWith({ queryKey: eventsKeys.photos("event-1") });
  expect(invalidate).toHaveBeenCalledWith({ queryKey: eventsKeys.participants("event-1") });
  // The roll closes under the screen as the cut lands; that doesn't send it back.
  expect(mockBack).not.toHaveBeenCalled();
});

test("while the cut is on its way it can't be dismissed", async () => {
  await renderScreen();
  const pending = deferred<unknown>();
  mockDeactivate.mockReturnValue(pending.promise);
  const user = userEvent.setup();
  await user.press(await screen.findByRole("button", { name: "Cut it and remove 148 photos" }));

  await waitFor(() => expect(screen.getByRole("button", { name: "Keep it open" })).toBeDisabled());
  expect(screen.getByRole("button", { name: "Close" })).toBeDisabled();
  pending.resolve({ data: { data: openRoll({ galleryState: "CLOSED" }) } });
  await waitFor(() => expect(mockDismissTo).toHaveBeenCalled());
});

test("a refused cut says why and stays", async () => {
  await renderScreen();
  mockDeactivate.mockRejectedValue(createApiError("Only hosts can do that.", { status: 403 }));
  await userEvent.setup().press(await screen.findByRole("button", { name: "Cut it and remove 148 photos" }));

  expect(await screen.findByText("Only hosts can do that.")).toBeOnTheScreen();
  expect(mockDismissTo).not.toHaveBeenCalled();
  expect(mockBack).not.toHaveBeenCalled();
});

test("Keep it open goes back without cutting", async () => {
  await renderScreen();
  await userEvent.setup().press(await screen.findByRole("button", { name: "Keep it open" }));
  expect(mockBack).toHaveBeenCalled();
  expect(mockDeactivate).not.toHaveBeenCalled();
});

test("an upcoming roll has no photos to remove or save", async () => {
  await renderScreen({ event: openRoll({ galleryState: "UPCOMING", photoCount: 0 }), photos: [] });

  expect(await screen.findByLabelText("At once, No photos to remove")).toBeOnTheScreen();
  expect(screen.getByText("Can’t be undone")).toBeOnTheScreen();
  expect(screen.getByRole("button", { name: "Cut it now" })).toBeOnTheScreen();
  expect(mockListPhotos).not.toHaveBeenCalled();
});

test("a suspended roll's photos are hidden, and still go", async () => {
  await renderScreen({ event: openRoll({ status: "SUSPENDED", photoCount: 0 }), photos: [] });

  expect(await screen.findByLabelText("At once, Its hidden photos are removed")).toBeOnTheScreen();
  expect(screen.getByRole("button", { name: "Cut it and remove the photos" })).toBeOnTheScreen();
  expect(mockListPhotos).not.toHaveBeenCalled();
});

test("sends anyone but a host back", async () => {
  mockUser = { id: "user-2" };
  await renderScreen({
    participants: [buildParticipant(), buildParticipant({ userId: "user-2", accessLevel: "PARTICIPANT" })],
  });
  await waitFor(() => expect(mockBack).toHaveBeenCalled());
  expect(screen.queryByRole("button", { name: /^Cut it/ })).toBeNull();
});

test("a roll that has already closed goes back", async () => {
  await renderScreen({ event: openRoll({ galleryState: "CLOSED" }) });
  await waitFor(() => expect(mockBack).toHaveBeenCalled());
});
