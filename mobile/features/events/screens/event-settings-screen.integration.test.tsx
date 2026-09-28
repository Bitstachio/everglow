import { mockColorScheme } from "../testing/native-mocks";
// eslint-disable-next-line no-restricted-imports
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, userEvent, waitFor } from "@testing-library/react-native";
// eslint-disable-next-line no-restricted-imports
import { Alert } from "react-native";
import EventSettingsScreen from "./event-settings-screen";
import { buildEvent, buildParticipant } from "../testing/fixtures";
import { formatEventDateTime } from "../utils";

const mockFindOne = jest.fn();
const mockGetParticipants = jest.fn();
const mockRemove = jest.fn();
const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockPush = jest.fn();

let mockUser: { id: string } | null = { id: "user-1" };
let mockEventId: string | string[] = "event-1";

jest.mock("@/lib/api/generated/client.gen", () => ({ client: { getConfig: () => ({}) } }));
jest.mock("@/lib/api/generated", () => ({
  eventsControllerFindOne: (...args: unknown[]) => mockFindOne(...args),
  eventsControllerGetParticipants: (...args: unknown[]) => mockGetParticipants(...args),
  eventsControllerRemove: (...args: unknown[]) => mockRemove(...args),
}));
jest.mock("@/context/auth-context", () => ({ useAuth: () => ({ user: mockUser }) }));
jest.mock("expo-router", () => ({
  useRouter: () => ({ back: mockBack, replace: mockReplace, push: mockPush }),
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
  mockGetParticipants.mockReset();
  mockRemove.mockReset().mockResolvedValue({});
  mockBack.mockReset();
  mockReplace.mockReset();
  mockPush.mockReset();
  jest.spyOn(Alert, "alert").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
  clients.splice(0).forEach((client) => client.clear());
});

test("lists event fields and opens the title editor", async () => {
  const event = buildEvent();
  await renderScreen(event);
  const { date, time } = formatEventDateTime(event.date);

  expect(await screen.findByText("Title")).toBeOnTheScreen();
  expect(screen.getByText("Weekend meetup")).toBeOnTheScreen();
  expect(screen.getByText("An afternoon with friends")).toBeOnTheScreen();
  expect(screen.getByText(`${date} · ${time}`)).toBeOnTheScreen();
  expect(screen.getByText("Danger Zone")).toBeOnTheScreen();
  expect(screen.getByText("Delete Event")).toBeOnTheScreen();

  await userEvent.setup().press(screen.getByLabelText("Title"));
  expect(mockPush).toHaveBeenCalledWith("/events/event-1/edit-title");
});

test("opens description and date editors", async () => {
  await renderScreen();
  await screen.findByText("Title");
  const user = userEvent.setup();
  await user.press(screen.getByLabelText("Description"));
  expect(mockPush).toHaveBeenCalledWith("/events/event-1/edit-description");
  await user.press(screen.getByLabelText("Date & Time"));
  expect(mockPush).toHaveBeenCalledWith("/events/event-1/edit-date");
});

test("deletes the event from the danger zone and returns to the events root", async () => {
  await renderScreen();
  await screen.findByText("Delete Event");
  await userEvent.setup().press(screen.getByLabelText("Delete Event"));
  confirmDestructiveAlert();

  await waitFor(() => expect(mockRemove).toHaveBeenCalledWith({ path: { eventId: "event-1" }, throwOnError: true }));
  expect(mockReplace).toHaveBeenCalledWith("/events");
  expect(Alert.alert).toHaveBeenCalledWith("Success", "Event deleted successfully");
});

test("sends non-organizers back", async () => {
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
