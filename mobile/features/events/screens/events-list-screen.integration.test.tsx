import { mockColorScheme } from "../testing/native-mocks";
// Integration tests compose the real screen with its data provider.
// eslint-disable-next-line no-restricted-imports
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, userEvent, waitFor } from "@testing-library/react-native";
// Observe the native alert boundary without replacing screen hooks.
// eslint-disable-next-line no-restricted-imports
import { Alert } from "react-native";
import EventsListScreen from "./events-list-screen";
import { buildEvent, deferred } from "../testing/fixtures";

const mockFindAll = jest.fn();
const mockPush = jest.fn();
let mockUser: { id: string } | null = { id: "user-1" };
let mockFocused = true;
jest.mock("@/lib/api/generated/client.gen", () => ({ client: { getConfig: () => ({}) } }));
jest.mock("@/lib/api/generated", () => ({
  eventsControllerFindAll: (...args: unknown[]) => mockFindAll(...args),
}));
jest.mock("@/context/auth-context", () => ({ useAuth: () => ({ user: mockUser }) }));
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush }),
  useFocusEffect: (callback: () => void) => {
    const { useEffect } = jest.requireActual<typeof import("react")>("react");
    const focused = mockFocused;
    useEffect(() => {
      if (focused) return callback();
    }, [callback, focused]);
  },
}));

const renderScreen = async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false, gcTime: 0 } },
  });
  const tree = () => (
    <QueryClientProvider client={client}>
      <EventsListScreen />
    </QueryClientProvider>
  );
  const result = await render(tree());
  return { rerender: () => result.rerender(tree()) };
};

beforeEach(() => {
  mockUser = { id: "user-1" };
  mockFocused = true;
  mockColorScheme.mockReturnValue("light");
  mockFindAll.mockReset().mockResolvedValue({ data: { data: [] } });
  mockPush.mockReset();
  jest.spyOn(Alert, "alert").mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

test("loads and displays event cards", async () => {
  mockFindAll.mockResolvedValue({
    data: { data: [buildEvent(), buildEvent({ id: "event-2", title: "Picnic" })] },
  });
  await renderScreen();
  expect(await screen.findByText("Weekend meetup")).toBeOnTheScreen();
  expect(screen.getByText("Picnic")).toBeOnTheScreen();
});

test("shows the empty state when there are no events", async () => {
  const pending = deferred<unknown>();
  mockFindAll.mockReturnValue(pending.promise);
  await renderScreen();
  expect(screen.getByLabelText("Loading events")).toBeOnTheScreen();
  pending.resolve({ data: { data: [] } });
  expect(await screen.findByText("No events yet")).toBeOnTheScreen();
});

test("opens event details from a card", async () => {
  mockFindAll.mockResolvedValue({ data: { data: [buildEvent()] } });
  await renderScreen();
  await screen.findByText("Weekend meetup");
  await userEvent.setup().press(screen.getByRole("button", { name: "Open Weekend meetup" }));
  expect(mockPush).toHaveBeenCalledWith("/events/event-1");
});

test("opens the creator invitation modal without navigating", async () => {
  const event = buildEvent();
  mockFindAll.mockResolvedValue({
    data: { data: [event, buildEvent({ id: "event-2", title: "Guest event", creatorId: "other" })] },
  });
  await renderScreen();
  await screen.findByText(event.title);
  expect(screen.queryByRole("button", { name: "Share Guest event" })).not.toBeOnTheScreen();
  await userEvent.setup().press(screen.getByRole("button", { name: `Share ${event.title}` }));
  expect(screen.getByText("Share Event")).toBeOnTheScreen();
  expect(mockPush).not.toHaveBeenCalled();
});

test("pull-to-refresh retains current events until the refreshed list arrives", async () => {
  mockFindAll.mockResolvedValue({ data: { data: [buildEvent()] } });
  await renderScreen();
  await screen.findByText("Weekend meetup");
  const pending = deferred<unknown>();
  mockFindAll.mockReturnValue(pending.promise);
  await fireEvent(screen.getByTestId("events-list-refresh"), "refresh");
  await waitFor(() => expect(screen.getByTestId("events-list-refresh")).toHaveProp("refreshing", true));
  expect(screen.getByText("Weekend meetup")).toBeOnTheScreen();
  pending.resolve({ data: { data: [buildEvent({ title: "Updated meetup" })] } });
  expect(await screen.findByText("Updated meetup")).toBeOnTheScreen();
});

test("filters the list by organizer role from the filters sheet", async () => {
  mockFindAll.mockResolvedValue({
    data: {
      data: [buildEvent(), buildEvent({ id: "event-2", title: "Picnic", creatorId: "user-2" })],
    },
  });
  await renderScreen();
  await screen.findByText("Weekend meetup");
  expect(screen.getByText("Picnic")).toBeOnTheScreen();

  const user = userEvent.setup();
  await user.press(screen.getByRole("button", { name: "Filters" }));
  expect(screen.getByText("Filter My Events")).toBeOnTheScreen();
  await user.press(screen.getByRole("button", { name: "Filter by Organizer" }));
  await user.press(screen.getByRole("button", { name: "Apply filters" }));

  expect(screen.getByText("Weekend meetup")).toBeOnTheScreen();
  expect(screen.queryByText("Picnic")).not.toBeOnTheScreen();
  expect(screen.getByText("Filters · On")).toBeOnTheScreen();
});

test("keeps events that match any of multiple selected roles", async () => {
  mockFindAll.mockResolvedValue({
    data: {
      data: [buildEvent(), buildEvent({ id: "event-2", title: "Picnic", creatorId: "user-2" })],
    },
  });
  await renderScreen();
  await screen.findByText("Weekend meetup");

  const user = userEvent.setup();
  await user.press(screen.getByRole("button", { name: "Filters" }));
  await user.press(screen.getByRole("button", { name: "Filter by Organizer" }));
  await user.press(screen.getByRole("button", { name: "Filter by Participant" }));
  await user.press(screen.getByRole("button", { name: "Apply filters" }));

  expect(screen.getByText("Weekend meetup")).toBeOnTheScreen();
  expect(screen.getByText("Picnic")).toBeOnTheScreen();
  expect(screen.getByText("Filters · On")).toBeOnTheScreen();
});

test("toggles date sort between ascending and descending", async () => {
  mockFindAll.mockResolvedValue({
    data: {
      data: [
        buildEvent({ id: "early", title: "Brunch", date: "2026-09-10T12:00:00.000Z" }),
        buildEvent({ id: "late", title: "Dinner", date: "2026-09-30T09:00:00.000Z" }),
      ],
    },
  });
  await renderScreen();
  await screen.findByText("Brunch");
  expect(screen.getByRole("button", { name: "Date · Earliest" })).toBeOnTheScreen();

  const openLabels = () =>
    screen.getAllByRole("button", { name: /Open / }).map((node) => node.props.accessibilityLabel);
  expect(openLabels()).toEqual(["Open Brunch", "Open Dinner"]);

  await userEvent.setup().press(screen.getByRole("button", { name: "Date · Earliest" }));
  expect(screen.getByRole("button", { name: "Date · Latest" })).toBeOnTheScreen();
  expect(openLabels()).toEqual(["Open Dinner", "Open Brunch"]);
});
