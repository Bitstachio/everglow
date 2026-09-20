import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, userEvent, waitFor } from "@testing-library/react-native";
import { Alert, Button, Text, View } from "react-native";
import { useEventsScreen } from "./use-events-screen";

const mockFindAll = jest.fn();
const mockJoin = jest.fn();

jest.mock("@/lib/api/generated/client.gen", () => ({ client: { getConfig: () => ({}) } }));
jest.mock("@/lib/api/generated", () => ({
  eventsControllerFindAll: (...args: unknown[]) => mockFindAll(...args),
  eventsControllerJoin: (...args: unknown[]) => mockJoin(...args),
}));
jest.mock("@/context/auth-context", () => ({
  useAuth: () => ({ user: { id: "user-1" } }),
}));
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn() }),
  useFocusEffect: (callback: () => void) => {
    const { useEffect } = jest.requireActual<typeof import("react")>("react");
    useEffect(callback, [callback]);
  },
}));

const EventsProbe = () => {
  const { events, isLoading, handleJoinViaLink } = useEventsScreen();
  return (
    <View>
      <Text>{isLoading ? "Loading" : "Loaded"}</Text>
      {events.map((event) => (
        <Text key={event.id}>{event.title}</Text>
      ))}
      <Button title="Join" onPress={() => void handleJoinViaLink("https://example.com/invite")} />
    </View>
  );
};

const renderEvents = async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <EventsProbe />
    </QueryClientProvider>,
  );
};

beforeEach(() => {
  mockFindAll.mockReset().mockResolvedValue({ data: { data: [] } });
  mockJoin.mockReset();
  jest.spyOn(Alert, "alert").mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

test("joining refreshes the displayed event list through query invalidation", async () => {
  const event = { id: "event-1", title: "Weekend meetup" };
  mockJoin.mockImplementation(async () => {
    mockFindAll.mockResolvedValue({ data: { data: [event] } });
    return { data: { data: event } };
  });
  await renderEvents();
  await screen.findByText("Loaded");
  await userEvent.setup().press(screen.getByRole("button", { name: "Join" }));
  expect(await screen.findByText("Weekend meetup")).toBeOnTheScreen();
  expect(Alert.alert).toHaveBeenCalledWith("Success", "You have successfully joined the event!");
});

test("joining shows the normalized API error", async () => {
  mockJoin.mockRejectedValue(new Error("Invitation has expired"));
  await renderEvents();
  await screen.findByText("Loaded");
  await userEvent.setup().press(screen.getByRole("button", { name: "Join" }));
  await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith("Error", "Invitation has expired"));
});

test("list failures show the normalized API error", async () => {
  mockFindAll.mockRejectedValue(new Error("Network unavailable"));
  await renderEvents();
  await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith("Error", "Network unavailable"));
});
