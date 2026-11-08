import "../testing/native-mocks";
// eslint-disable-next-line no-restricted-imports
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, userEvent, waitFor } from "@testing-library/react-native";
import CantDeleteRollScreen from "./cant-delete-roll-screen";
import { buildEvent, buildParticipant } from "../testing/fixtures";
import { formatEnvelopeDay } from "../lib/envelope";

const mockFindOne = jest.fn();
const mockGetParticipants = jest.fn();
const mockListReports = jest.fn();
const mockRemove = jest.fn();
const mockBack = jest.fn();
const mockPush = jest.fn();

let mockUser: { id: string } | null = { id: "user-1" };

jest.mock("@/lib/api/generated/client.gen", () => ({ client: { getConfig: () => ({}) } }));
jest.mock("@/lib/api/generated", () => ({
  eventsControllerFindOne: (...args: unknown[]) => mockFindOne(...args),
  eventsControllerGetParticipants: (...args: unknown[]) => mockGetParticipants(...args),
  eventsControllerRemove: (...args: unknown[]) => mockRemove(...args),
  reportsControllerListReports: (...args: unknown[]) => mockListReports(...args),
}));
jest.mock("@/context/auth-context", () => ({ useAuth: () => ({ user: mockUser }) }));
jest.mock("expo-router", () => ({
  useRouter: () => ({ back: mockBack, push: mockPush }),
  useLocalSearchParams: () => ({ id: "event-1" }),
}));
jest.mock("@/hooks/use-reduce-motion", () => ({ useReduceMotion: () => true }));

const clients: QueryClient[] = [];

const memberReport = (id: string, reportedUserId: string) => ({
  id,
  eventId: "event-1",
  targetType: "MEMBER",
  photoId: null,
  reportedUserId,
  reason: "HARASSMENT",
  note: null,
  status: "OPEN",
  queue: "ORGANIZERS",
  createdAt: "2026-11-01T12:00:00.000Z",
  updatedAt: "2026-11-01T12:00:00.000Z",
});

const renderScreen = async ({
  event = buildEvent({ galleryState: "OPEN", galleryClosesAt: new Date(2026, 10, 17, 16, 0).toISOString() }),
  participants = [buildParticipant()],
  reports = [] as ReturnType<typeof memberReport>[],
} = {}) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: 0 } },
  });
  clients.push(client);
  mockFindOne.mockResolvedValue({ data: { data: event } });
  mockGetParticipants.mockResolvedValue({ data: { data: participants } });
  mockListReports.mockResolvedValue({ data: { data: { items: reports, nextCursor: null } } });
  await render(
    <QueryClientProvider client={client}>
      <CantDeleteRollScreen />
    </QueryClientProvider>,
  );
};

beforeEach(() => {
  mockUser = { id: "user-1" };
  mockFindOne.mockReset();
  mockGetParticipants.mockReset();
  mockListReports.mockReset();
  mockRemove.mockReset();
  mockBack.mockReset();
  mockPush.mockReset();
});

afterEach(() => {
  clients.splice(0).forEach((client) => client.clear());
});

test("an open roll waits until it closes, and the API is never asked to delete it", async () => {
  await renderScreen();

  expect(await screen.findByText("Roll settings")).toBeOnTheScreen();
  expect(screen.getByRole("header", { name: "Can’t delete\nthis roll yet." })).toBeOnTheScreen();
  expect(screen.getByLabelText("Still open, Cut it or wait until 17 Nov")).toBeOnTheScreen();
  expect(screen.getByText(/A roll is deleted only after it closes/)).toBeOnTheScreen();
  expect(screen.queryByLabelText(/reports?,/)).toBeNull();
  expect(screen.queryByLabelText(/^Under review/)).toBeNull();
  expect(mockRemove).not.toHaveBeenCalled();
});

test("an upcoming roll isn't open yet", async () => {
  const closesAt = new Date(2026, 11, 2, 19, 0).toISOString();
  await renderScreen({ event: buildEvent({ galleryState: "UPCOMING", galleryClosesAt: closesAt }) });
  expect(
    await screen.findByLabelText(`Not open yet, Cut it or wait until ${formatEnvelopeDay(closesAt)}`),
  ).toBeOnTheScreen();
});

test("a roll that never closes can only be cut first", async () => {
  await renderScreen({ event: buildEvent({ galleryState: "OPEN", galleryClosesAt: null, galleryWindowDays: null }) });
  expect(await screen.findByLabelText("Still open, Cut it first")).toBeOnTheScreen();
});

test("open reports and a review are listed too, and the reports open from here", async () => {
  await renderScreen({
    event: buildEvent({
      galleryState: "OPEN",
      status: "UNDER_REVIEW",
      galleryClosesAt: new Date(2026, 10, 17, 16, 0).toISOString(),
    }),
    reports: [memberReport("report-1", "user-2"), memberReport("report-2", "user-3")],
  });

  expect(await screen.findByRole("button", { name: "2 reports, Check them first" })).toBeOnTheScreen();
  expect(screen.getByLabelText("Under review, Wait for Everglow")).toBeOnTheScreen();
  await userEvent.setup().press(screen.getByRole("button", { name: "2 reports, Check them first" }));
  expect(mockPush).toHaveBeenCalledWith({ pathname: "/events/[id]/reports", params: { id: "event-1" } });
});

test("a closed roll is deleted from settings, so this goes back", async () => {
  await renderScreen({ event: buildEvent({ galleryState: "CLOSED" }) });
  await waitFor(() => expect(mockBack).toHaveBeenCalled());
});

test("sends anyone but a host back", async () => {
  mockUser = { id: "user-2" };
  await renderScreen({
    participants: [buildParticipant(), buildParticipant({ userId: "user-2", accessLevel: "PARTICIPANT" })],
  });
  await waitFor(() => expect(mockBack).toHaveBeenCalled());
  expect(mockListReports).not.toHaveBeenCalled();
});
