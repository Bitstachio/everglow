// Integration tests compose the real screen with its data hooks.
// eslint-disable-next-line no-restricted-imports
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react-native";
import UsageScreen from "./usage-screen";

const mockGetMyLimits = jest.fn();

jest.mock("@/lib/api/generated/client.gen", () => ({ client: { getConfig: () => ({}) } }));
jest.mock("@/lib/api/generated", () => ({
  usersControllerCheckUsernameAvailability: jest.fn(),
  usersControllerGetMyLimits: (...args: unknown[]) => mockGetMyLimits(...args),
}));
jest.mock("@/context/auth-context", () => ({
  useAuth: () => ({ user: { id: "user-1" } }),
}));

const renderScreen = async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <UsageScreen />
    </QueryClientProvider>,
  );
};

beforeEach(() => {
  jest.clearAllMocks();
});

test("shows the caller's active events and the event that closes next", async () => {
  mockGetMyLimits.mockResolvedValue({
    data: {
      data: {
        plan: "FREE",
        limits: { activeEvents: 2 },
        usage: { activeEvents: 1 },
        nextClosingEvent: { id: "event-1", title: "Book Club", galleryClosesAt: "2026-10-20T12:00:00.000Z" },
      },
      meta: {},
    },
  });

  await renderScreen();

  expect(await screen.findByText("1 of 2 active events")).toBeOnTheScreen();
  expect(screen.getByText("Book Club, Oct 20")).toBeOnTheScreen();
  expect(mockGetMyLimits).toHaveBeenCalledWith(expect.objectContaining({ throwOnError: true }));
});

test("offers a retry when the limits cannot be loaded", async () => {
  mockGetMyLimits.mockRejectedValue(new Error("Network unavailable"));

  await renderScreen();

  expect(await screen.findByRole("alert")).toHaveTextContent("Could not refresh your active events.");
  expect(screen.getByRole("button", { name: "Retry" })).toBeOnTheScreen();
});
