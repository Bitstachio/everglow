import "../testing/native-mocks";
// eslint-disable-next-line no-restricted-imports
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react-native";
// eslint-disable-next-line no-restricted-imports
import { Alert } from "react-native";
import EventSettingsScreen from "./event-settings-screen";
import { buildEvent, buildParticipant } from "../testing/fixtures";
import { formatClosesUntil, formatOpensAt } from "../lib/roll-page";

const mockFindOne = jest.fn();
const mockGetParticipants = jest.fn();
const mockBack = jest.fn();

let mockUser: { id: string } | null = { id: "user-1" };
let mockEventId: string | string[] = "event-1";

jest.mock("@/lib/api/generated/client.gen", () => ({ client: { getConfig: () => ({}) } }));
jest.mock("@/lib/api/generated", () => ({
  eventsControllerFindOne: (...args: unknown[]) => mockFindOne(...args),
  eventsControllerGetParticipants: (...args: unknown[]) => mockGetParticipants(...args),
}));
jest.mock("@/context/auth-context", () => ({ useAuth: () => ({ user: mockUser }) }));
jest.mock("expo-router", () => ({
  useRouter: () => ({ back: mockBack }),
  useLocalSearchParams: () => ({ id: mockEventId }),
}));

const clients: QueryClient[] = [];

const renderScreen = async (event = buildEvent()) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: 0 } },
  });
  clients.push(client);
  mockFindOne.mockResolvedValue({ data: { data: event } });
  mockGetParticipants.mockResolvedValue({ data: { data: [buildParticipant()] } });
  await render(
    <QueryClientProvider client={client}>
      <EventSettingsScreen />
    </QueryClientProvider>,
  );
  return client;
};

beforeEach(() => {
  mockUser = { id: "user-1" };
  mockEventId = "event-1";
  mockFindOne.mockReset();
  mockGetParticipants.mockReset();
  mockBack.mockReset();
  jest.spyOn(Alert, "alert").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
  clients.splice(0).forEach((client) => client.clear());
});

test("upcoming: every schedule row can still change", async () => {
  const event = buildEvent({
    galleryState: "UPCOMING",
    galleryOpensAt: "2026-11-07T19:00:00.000Z",
    galleryWindowDays: 7,
    coverUrl: null,
    description: null,
  });
  await renderScreen(event);

  expect(await screen.findByText("Roll settings")).toBeOnTheScreen();
  expect(screen.getByText(event.title)).toBeOnTheScreen();
  expect(screen.getByText(`Opens ${formatOpensAt(event.galleryOpensAt)}`)).toBeOnTheScreen();

  expect(screen.getByRole("button", { name: `Name, ${event.title}` })).toBeOnTheScreen();
  expect(screen.getByRole("button", { name: "Cover, Add" })).toBeOnTheScreen();
  expect(screen.getByRole("button", { name: "Note for guests, Add" })).toBeOnTheScreen();
  expect(screen.getByRole("button", { name: `When, ${formatOpensAt(event.date)}` })).toBeOnTheScreen();
  expect(screen.getByRole("button", { name: "Film, 7-day roll" })).toBeOnTheScreen();
  expect(screen.getByLabelText("Storage, 0 of 3 GB")).toBeOnTheScreen();
  expect(screen.getByRole("button", { name: "Envelopes, Two · reset" })).toBeOnTheScreen();
  expect(screen.getByLabelText("Delete the roll, After it closes")).toBeOnTheScreen();
  expect(screen.queryByText(/locked once the gallery opens/)).toBeNull();
});

test("open: date and film are locked and explain why", async () => {
  const event = buildEvent({
    galleryState: "OPEN",
    galleryClosesAt: "2026-11-17T16:00:00.000Z",
    galleryWindowDays: 30,
    coverUrl: "https://cdn.example.com/cover.jpg",
    description: "Black tie",
  });
  await renderScreen(event);

  expect(await screen.findByText(`Open · until ${formatClosesUntil(event.galleryClosesAt!)}`)).toBeOnTheScreen();
  expect(screen.getByRole("button", { name: "Cover, Change" })).toBeOnTheScreen();
  expect(screen.getByRole("button", { name: "Note for guests, Black tie" })).toBeOnTheScreen();
  expect(screen.getByLabelText(`When, ${formatOpensAt(event.date)} · locked`)).toBeOnTheScreen();
  expect(screen.getByLabelText("Film, 30-day roll · locked")).toBeOnTheScreen();
  expect(screen.getByText(/locked once the gallery opens/)).toBeOnTheScreen();
});

test("sends non-hosts back", async () => {
  mockUser = { id: "user-2" };
  mockFindOne.mockResolvedValue({ data: { data: buildEvent({ creatorId: "user-1" }) } });
  mockGetParticipants.mockResolvedValue({
    data: {
      data: [buildParticipant(), buildParticipant({ userId: "user-2", name: "Guest", accessLevel: "PARTICIPANT" })],
    },
  });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: 0 } },
  });
  clients.push(client);
  await render(
    <QueryClientProvider client={client}>
      <EventSettingsScreen />
    </QueryClientProvider>,
  );

  await waitFor(() => expect(mockBack).toHaveBeenCalled());
});
