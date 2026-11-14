// Integration tests compose the real screen with its data hooks.
// eslint-disable-next-line no-restricted-imports
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { screen, userEvent, waitFor } from "@testing-library/react-native";
// Observe the native alert boundary without replacing screen hooks.
// eslint-disable-next-line no-restricted-imports
import { Alert } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { renderWithI18n } from "@/testing/render";
import RemovedPeopleScreen from "./removed-people-screen";

const mockListBans = jest.fn();
const mockLiftBan = jest.fn();
jest.mock("@/lib/api/generated/client.gen", () => ({ client: { getConfig: () => ({}) } }));
jest.mock("@/lib/api/generated", () => ({
  eventsControllerListBans: (...args: unknown[]) => mockListBans(...args),
  eventsControllerLiftBan: (...args: unknown[]) => mockLiftBan(...args),
}));
jest.mock("@/hooks/use-reduce-motion", () => ({ useReduceMotion: () => true }));
jest.mock("expo-router", () => ({
  useRouter: () => ({ back: jest.fn(), canGoBack: () => true, replace: jest.fn() }),
  useLocalSearchParams: () => ({ id: "event-1" }),
}));

const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});

const initialMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const bans = [
  { userId: "u-dan", name: "Dan Ruiz", username: "dan", bannedAt: "2026-10-19T00:00:00.000Z" },
  { userId: "u-gone", name: null, username: null, bannedAt: "2026-10-18T00:00:00.000Z" },
];
const listed = (items: unknown[]) => Promise.resolve({ data: { data: { items }, meta: {} } });

const renderScreen = () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false, gcTime: 0 } },
  });
  return renderWithI18n(
    <SafeAreaProvider initialMetrics={initialMetrics}>
      <QueryClientProvider client={client}>
        <RemovedPeopleScreen />
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
};

beforeEach(() => {
  jest.clearAllMocks();
  mockListBans.mockImplementation(() => listed(bans));
  mockLiftBan.mockResolvedValue({});
});

test("lists the people removed from the roll, newest first, with a stand-in for one with no profile", async () => {
  await renderScreen();

  expect(await screen.findByText("Dan Ruiz")).toBeOnTheScreen();
  expect(screen.getByText("No lab card")).toBeOnTheScreen();
  expect(screen.getByRole("header", { name: "Removed · 2" })).toBeOnTheScreen();
  expect(screen.getByText("They can’t join with any envelope until you let them back in.")).toBeOnTheScreen();
  expect(mockListBans).toHaveBeenCalledWith(expect.objectContaining({ path: { eventId: "event-1" } }));
});

test("letting someone back in takes the row away and asks the API", async () => {
  await renderScreen();
  await screen.findByText("Dan Ruiz");
  mockListBans.mockImplementation(() => listed(bans.slice(1)));

  await userEvent.setup().press(screen.getByRole("button", { name: "Let Dan Ruiz back in" }));

  expect(screen.queryByText("Dan Ruiz")).not.toBeOnTheScreen();
  expect(mockLiftBan).toHaveBeenCalledWith(expect.objectContaining({ path: { eventId: "event-1", userId: "u-dan" } }));
  await waitFor(() => expect(screen.getByRole("header", { name: "Removed · 1" })).toBeOnTheScreen());
});

test("a failed Let back in puts the row back and says so", async () => {
  mockLiftBan.mockRejectedValue(new Error("Offline"));
  await renderScreen();
  await screen.findByText("Dan Ruiz");

  await userEvent.setup().press(screen.getByRole("button", { name: "Let Dan Ruiz back in" }));

  await waitFor(() => expect(alert).toHaveBeenCalledWith("Couldn’t let them back in", expect.any(String)));
  expect(screen.getByText("Dan Ruiz")).toBeOnTheScreen();
});

test("nobody removed says so", async () => {
  mockListBans.mockImplementation(() => listed([]));
  await renderScreen();
  expect(await screen.findByText("Nobody is removed from this roll.")).toBeOnTheScreen();
  // The top bar has no count then, the same word as the title.
  expect(screen.getAllByRole("header", { name: "Removed" })).toHaveLength(2);
});

test("a list that didn't load can be tried again", async () => {
  mockListBans.mockRejectedValueOnce(new Error("Offline"));
  await renderScreen();
  expect(await screen.findByText("Couldn’t load the people removed from this roll.")).toBeOnTheScreen();
  await userEvent.setup().press(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByText("Dan Ruiz")).toBeOnTheScreen();
});
