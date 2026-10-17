// Integration tests compose the real screen with its data hooks.
// eslint-disable-next-line no-restricted-imports
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderWithI18n } from "@/testing/render";
import { screen, userEvent, waitFor } from "@testing-library/react-native";
// Observe the native alert boundary without replacing screen hooks.
// eslint-disable-next-line no-restricted-imports
import { Alert } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import BlockedPeopleScreen from "./blocked-people-screen";

const mockList = jest.fn();
const mockUnblock = jest.fn();
jest.mock("@/lib/api/generated/client.gen", () => ({ client: { getConfig: () => ({}) } }));
jest.mock("@/lib/api/generated", () => ({
  blocksControllerList: (...args: unknown[]) => mockList(...args),
  blocksControllerUnblock: (...args: unknown[]) => mockUnblock(...args),
}));
jest.mock("@/context/auth-context", () => ({ useAuth: () => ({ user: null, updateUser: jest.fn() }) }));
jest.mock("expo-router", () => ({ router: { back: jest.fn(), canGoBack: () => true, replace: jest.fn() } }));

const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});

const initialMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const blocks = [
  { userId: "u-leila", name: "Leila Haddad", username: "leila.h", blockedAt: "2026-10-10T00:00:00.000Z" },
  { userId: "u-gone", name: null, username: null, blockedAt: "2026-10-09T00:00:00.000Z" },
];
const listed = (items: unknown[]) => Promise.resolve({ data: { data: { items }, meta: {} } });

const renderScreen = () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false, gcTime: 0 } },
  });
  return renderWithI18n(
    <SafeAreaProvider initialMetrics={initialMetrics}>
      <QueryClientProvider client={client}>
        <BlockedPeopleScreen />
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
};

beforeEach(() => {
  jest.clearAllMocks();
  mockList.mockImplementation(() => listed(blocks));
  mockUnblock.mockResolvedValue({});
});

test("lists the people you blocked, with a stand-in for one with no profile", async () => {
  await renderScreen();

  expect(await screen.findByText("Leila Haddad")).toBeOnTheScreen();
  expect(screen.getByText("@leila.h")).toBeOnTheScreen();
  expect(screen.getByText("No lab card")).toBeOnTheScreen();
  expect(screen.getByRole("header", { name: "Blocked · 2" })).toBeOnTheScreen();
});

test("unblocking takes the row away at once and asks the API", async () => {
  await renderScreen();
  await screen.findByText("Leila Haddad");
  mockList.mockImplementation(() => listed(blocks.slice(1)));

  await userEvent.setup().press(screen.getByRole("button", { name: "Unblock Leila Haddad" }));

  expect(screen.queryByText("Leila Haddad")).not.toBeOnTheScreen();
  expect(mockUnblock).toHaveBeenCalledWith(expect.objectContaining({ path: { userId: "u-leila" } }));
  await waitFor(() => expect(screen.getByRole("header", { name: "Blocked · 1" })).toBeOnTheScreen());
});

test("a failed unblock puts the row back and says so", async () => {
  mockUnblock.mockRejectedValue(new Error("Offline"));
  await renderScreen();
  await screen.findByText("Leila Haddad");

  await userEvent.setup().press(screen.getByRole("button", { name: "Unblock Leila Haddad" }));

  await waitFor(() => expect(alert).toHaveBeenCalledWith("Couldn’t unblock", expect.any(String)));
  expect(await screen.findByText("Leila Haddad")).toBeOnTheScreen();
});

test("nobody blocked", async () => {
  mockList.mockImplementation(() => listed([]));
  await renderScreen();

  expect(await screen.findByText("You haven’t blocked anyone.")).toBeOnTheScreen();
});

test("a failed load offers to try again", async () => {
  mockList.mockRejectedValueOnce(new Error("Offline"));
  await renderScreen();

  await userEvent.setup().press(await screen.findByRole("button", { name: "Try again" }));

  expect(await screen.findByText("Leila Haddad")).toBeOnTheScreen();
});
