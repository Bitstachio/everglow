import "../testing/native-mocks";
import { createApiError } from "@/lib/api/errors";
// Integration tests compose the real screen with its data provider.
// eslint-disable-next-line no-restricted-imports
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, userEvent, waitFor } from "@testing-library/react-native";
// Observe the native alert boundary without replacing screen hooks.
// eslint-disable-next-line no-restricted-imports
import { Alert } from "react-native";
import EventsScreen from "./events-screen";
import { buildEvent, deferred } from "../testing/fixtures";

const mockFindAll = jest.fn();
const mockListPhotos = jest.fn();
const mockPush = jest.fn();
let mockUser: { id: string; details?: { name?: string; avatarUrl?: string | null } } | null = { id: "user-1" };
let mockFocused = true;
jest.mock("@/lib/api/generated/client.gen", () => ({ client: { getConfig: () => ({}) } }));
jest.mock("@/lib/api/generated", () => ({
  eventsControllerFindAll: (...args: unknown[]) => mockFindAll(...args),
  photosControllerListPhotos: (...args: unknown[]) => mockListPhotos(...args),
}));
jest.mock("@/context/auth-context", () => ({ useAuth: () => ({ user: mockUser }) }));
jest.mock("expo-router", () => {
  return {
    useRouter: () => ({ push: mockPush }),
    useFocusEffect: (callback: () => void) => {
      const { useEffect } = jest.requireActual<typeof import("react")>("react");
      const focused = mockFocused;
      useEffect(() => {
        if (focused) return callback();
      }, [callback, focused]);
    },
  };
});

const renderScreen = async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false, gcTime: 0 } },
  });
  const tree = () => (
    <QueryClientProvider client={client}>
      <EventsScreen />
    </QueryClientProvider>
  );
  const result = await render(tree());
  return { rerender: () => result.rerender(tree()) };
};

const openJoin = async () => userEvent.setup().press(screen.getByRole("button", { name: "Scan an envelope" }));

beforeEach(() => {
  mockUser = { id: "user-1" };
  mockFocused = true;
  mockFindAll.mockReset().mockResolvedValue({ data: { data: [] } });
  mockListPhotos.mockReset().mockResolvedValue({ data: { data: { items: [], nextCursor: null } } });
  mockPush.mockReset();
  jest.spyOn(Alert, "alert").mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

test("shows the film-strip skeletons while loading, then the first-run empty state", async () => {
  const pending = deferred<unknown>();
  mockFindAll.mockReturnValue(pending.promise);
  await renderScreen();
  expect(screen.getByTestId("home-loading")).toBeOnTheScreen();
  expect(screen.queryByText(/^No rolls yet\./)).not.toBeOnTheScreen();
  pending.resolve({ data: { data: [] } });
  expect(await screen.findByText(/^No rolls yet\./)).toBeOnTheScreen();
  expect(screen.getByRole("button", { name: "Start a roll" })).toBeOnTheScreen();
  expect(screen.getByRole("button", { name: "Join with an envelope" })).toBeOnTheScreen();
});

test("starts a roll from the first-run screen", async () => {
  await renderScreen();
  await screen.findByText(/^No rolls yet\./);
  await userEvent.setup().press(screen.getByRole("button", { name: "Start a roll" }));
  expect(mockPush).toHaveBeenCalledWith("/events/create");
});

test("lists the rolls, groups the closed ones, and opens a roll", async () => {
  mockFindAll.mockResolvedValue({
    data: {
      data: [
        buildEvent({ id: "live-1", title: "Sam & Jo’s wedding", galleryState: "OPEN" }),
        buildEvent({ id: "up-1", title: "Friday at Sully’s", galleryState: "UPCOMING" }),
        buildEvent({ id: "done-1", title: "Lake weekend", galleryState: "CLOSED" }),
      ],
    },
  });
  await renderScreen();
  await screen.findByText("Sam & Jo’s wedding");
  expect(screen.getByText("Friday at Sully’s")).toBeOnTheScreen();
  expect(screen.getByText("Lake weekend")).toBeOnTheScreen();
  expect(screen.getByText("Photos removed")).toBeOnTheScreen();

  await userEvent.setup().press(screen.getByRole("button", { name: /Sam & Jo’s wedding/ }));
  expect(mockPush).toHaveBeenCalledWith("/events/live-1");
});

test("loads the latest four photos of open rolls only", async () => {
  mockFindAll.mockResolvedValue({
    data: {
      data: [
        buildEvent({ id: "live-1", title: "Sam & Jo’s wedding", galleryState: "OPEN" }),
        buildEvent({ id: "up-1", title: "Friday at Sully’s", galleryState: "UPCOMING" }),
        buildEvent({ id: "done-1", title: "Lake weekend", galleryState: "CLOSED" }),
      ],
    },
  });
  await renderScreen();
  await screen.findByText("Sam & Jo’s wedding");

  await waitFor(() => expect(mockListPhotos).toHaveBeenCalledTimes(1));
  expect(mockListPhotos).toHaveBeenCalledWith(
    expect.objectContaining({ path: { eventId: "live-1" }, query: { limit: 4 } }),
  );
});

test("pull-to-refresh reloads the open rolls' photos too", async () => {
  mockFindAll.mockResolvedValue({
    data: { data: [buildEvent({ id: "live-1", title: "Sam & Jo’s wedding", galleryState: "OPEN" })] },
  });
  await renderScreen();
  await screen.findByText("Sam & Jo’s wedding");
  await waitFor(() => expect(mockListPhotos).toHaveBeenCalledTimes(1));

  await fireEvent(screen.getByTestId("home-refresh"), "refresh");

  await waitFor(() => expect(mockListPhotos).toHaveBeenCalledTimes(2));
});

test("adds a new event from the rolls list", async () => {
  mockFindAll.mockResolvedValue({ data: { data: [buildEvent({ title: "Nadia turns 30" })] } });
  await renderScreen();
  await screen.findByText("Nadia turns 30");
  await userEvent.setup().press(screen.getByRole("button", { name: "New event" }));
  expect(mockPush).toHaveBeenCalledWith("/events/create");
});

test("shows the offline banner and blocks a new event when the lab can't be reached", async () => {
  mockFindAll.mockRejectedValue(createApiError("gateway", { status: 503 }));
  await renderScreen();
  expect(await screen.findByText("No connection")).toBeOnTheScreen();
  expect(screen.getByText("Back online to start a roll")).toBeOnTheScreen();
  expect(screen.getByRole("button", { name: "New event" })).toBeDisabled();
  expect(screen.getByText("Nothing saved yet")).toBeOnTheScreen();
  expect(Alert.alert).not.toHaveBeenCalled();
});

test("keeps the saved rolls on screen when the connection drops", async () => {
  mockFindAll.mockResolvedValue({ data: { data: [buildEvent({ title: "Nadia turns 30" })] } });
  await renderScreen();
  await screen.findByText("Nadia turns 30");
  mockFindAll.mockRejectedValue(createApiError("gateway", { status: 503 }));
  await fireEvent(screen.getByTestId("home-refresh"), "refresh");
  expect(await screen.findByText("Showing what’s saved")).toBeOnTheScreen();
  expect(screen.getByText("Nadia turns 30")).toBeOnTheScreen();
  // Each roll says when it was loaded, in place of its time (03.5).
  expect(screen.getByText(/ppl · as of \d\d:\d\d$/)).toBeOnTheScreen();
});

test("opens the lab card from the header avatar", async () => {
  await renderScreen();
  expect(screen.getByRole("header", { name: "Everglow" })).toBeOnTheScreen();
  await userEvent.setup().press(screen.getByRole("button", { name: "Your lab card" }));
  expect(mockPush).toHaveBeenCalledWith("/account-settings");
});

test("opens the scanner from the header and from the first-run leader (06.1)", async () => {
  await renderScreen();
  await screen.findByText(/^No rolls yet\./);
  await openJoin();
  expect(mockPush).toHaveBeenLastCalledWith("/join");
  mockPush.mockReset();
  await userEvent.setup().press(screen.getByRole("button", { name: "Join with an envelope" }));
  expect(mockPush).toHaveBeenLastCalledWith("/join");
});

test("pull-to-refresh retains current rolls until the refreshed list arrives", async () => {
  mockFindAll.mockResolvedValue({ data: { data: [buildEvent({ title: "Nadia turns 30" })] } });
  await renderScreen();
  await screen.findByText("Nadia turns 30");
  const pending = deferred<unknown>();
  mockFindAll.mockReturnValue(pending.promise);
  await fireEvent(screen.getByTestId("home-refresh"), "refresh");
  await waitFor(() => expect(screen.getByTestId("home-refresh")).toHaveProp("refreshing", true));
  expect(screen.getByText("Nadia turns 30")).toBeOnTheScreen();
  pending.resolve({ data: { data: [buildEvent({ title: "Updated roll" })] } });
  expect(await screen.findByText("Updated roll")).toBeOnTheScreen();
  await waitFor(() => expect(screen.getByTestId("home-refresh")).toHaveProp("refreshing", false));
});

test("surfaces an unexpected fetch error and recovers on refresh", async () => {
  mockFindAll.mockRejectedValue(new Error("boom"));
  await renderScreen();
  await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith("Couldn’t load your rolls", "Please try again"));
  mockFindAll.mockResolvedValue({ data: { data: [buildEvent({ title: "Nadia turns 30" })] } });
  await fireEvent(screen.getByTestId("home-refresh"), "refresh");
  expect(await screen.findByText("Nadia turns 30")).toBeOnTheScreen();
});

test("does not fetch without a signed-in user", async () => {
  mockUser = null;
  await renderScreen();
  expect(screen.getByText(/^No rolls yet\./)).toBeOnTheScreen();
  await fireEvent(screen.getByTestId("home-refresh"), "refresh");
  expect(mockFindAll).not.toHaveBeenCalled();
});

test("refreshes on returning to Home", async () => {
  mockFindAll.mockResolvedValue({ data: { data: [buildEvent({ title: "Nadia turns 30" })] } });
  const { rerender } = await renderScreen();
  await screen.findByText("Nadia turns 30");
  mockFocused = false;
  await rerender();
  mockFindAll.mockResolvedValue({ data: { data: [buildEvent({ title: "Created on another page" })] } });
  mockFocused = true;
  await rerender();
  expect(await screen.findByText("Created on another page")).toBeOnTheScreen();
});
