import { createApiError } from "@/lib/api/errors";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, userEvent, waitFor } from "@testing-library/react-native";
import { Alert, Button, Text, View } from "react-native";
import { buildEvent } from "../testing/fixtures";
import { useEventsScreen } from "./use-events-screen";

const mockFindAll = jest.fn();
const mockJoin = jest.fn();
const mockPush = jest.fn();

jest.mock("@/lib/api/generated/client.gen", () => ({ client: { getConfig: () => ({}) } }));
jest.mock("@/lib/api/generated", () => ({
  eventsControllerFindAll: (...args: unknown[]) => mockFindAll(...args),
  eventsControllerJoin: (...args: unknown[]) => mockJoin(...args),
}));
jest.mock("@/context/auth-context", () => ({
  useAuth: () => ({ user: { id: "user-1", details: { name: "Ada", avatarUrl: null } } }),
}));
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush }),
  useFocusEffect: (callback: () => void) => {
    const { useEffect } = jest.requireActual<typeof import("react")>("react");
    useEffect(callback, [callback]);
  },
}));

const Probe = () => {
  const { groups, isLoading, isOffline, onNewEvent, onOpenRoll } = useEventsScreen();
  const firstLive = groups.live[0];
  return (
    <View>
      <Text>{isLoading ? "Loading" : "Loaded"}</Text>
      <Text testID="offline">{isOffline ? "offline" : "online"}</Text>
      <Text testID="live">{groups.live.length}</Text>
      <Text testID="upcoming">{groups.upcoming.length}</Text>
      <Text testID="closed">{groups.closed.length}</Text>
      <Button title="New event" onPress={onNewEvent} />
      {firstLive ? <Button title="Open roll" onPress={() => onOpenRoll(firstLive)} /> : null}
    </View>
  );
};

const renderHome = async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <Probe />
    </QueryClientProvider>,
  );
};

beforeEach(() => {
  mockFindAll.mockReset().mockResolvedValue({ data: { data: [] } });
  mockJoin.mockReset();
  mockPush.mockReset();
  jest.spyOn(Alert, "alert").mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

test("groups the rolls by gallery state", async () => {
  mockFindAll.mockResolvedValue({
    data: {
      data: [
        buildEvent({ id: "open", galleryState: "OPEN" }),
        buildEvent({ id: "upcoming", galleryState: "UPCOMING" }),
        buildEvent({ id: "closed", galleryState: "CLOSED" }),
      ],
    },
  });
  await renderHome();
  await screen.findByText("Loaded");
  expect(screen.getByTestId("live")).toHaveTextContent("1");
  expect(screen.getByTestId("upcoming")).toHaveTextContent("1");
  expect(screen.getByTestId("closed")).toHaveTextContent("1");
});

test("routes to create and to a roll's page", async () => {
  mockFindAll.mockResolvedValue({ data: { data: [buildEvent({ id: "roll-7", galleryState: "OPEN" })] } });
  await renderHome();
  await screen.findByText("Loaded");
  const user = userEvent.setup();
  await user.press(screen.getByRole("button", { name: "New event" }));
  expect(mockPush).toHaveBeenCalledWith("/events/create");
  await user.press(screen.getByRole("button", { name: "Open roll" }));
  expect(mockPush).toHaveBeenCalledWith("/events/roll-7");
});

test("a connection failure shows the offline state without alerting", async () => {
  mockFindAll.mockRejectedValue(createApiError("gateway", { status: 503 }));
  await renderHome();
  await waitFor(() => expect(screen.getByTestId("offline")).toHaveTextContent("offline"));
  expect(Alert.alert).not.toHaveBeenCalled();
});

test("an unexpected failure is surfaced", async () => {
  mockFindAll.mockRejectedValue(new Error("boom"));
  await renderHome();
  await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith("Error", expect.any(String)));
  expect(screen.getByTestId("offline")).toHaveTextContent("online");
});
