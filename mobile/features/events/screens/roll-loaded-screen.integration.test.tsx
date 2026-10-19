import "../testing/native-mocks";
// The integration harness supplies the real data provider.
// eslint-disable-next-line no-restricted-imports
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderWithI18n } from "@/testing/render";
import { screen, userEvent } from "@testing-library/react-native";
import RollLoadedScreen from "./roll-loaded-screen";
import { buildEvent, deferred } from "../testing/fixtures";
// Seed the cache the create fills, at the integration boundary.
// eslint-disable-next-line no-restricted-imports
import { eventsKeys } from "../api/keys";

const mockFindOne = jest.fn();
const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockBack = jest.fn();
let mockCanGoBack = true;

jest.mock("@/lib/api/generated/client.gen", () => ({ client: { getConfig: () => ({}) } }));
jest.mock("@/lib/api/generated", () => ({
  eventsControllerFindOne: (...args: unknown[]) => mockFindOne(...args),
}));
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ id: "roll-1" }),
  useRouter: () => ({ push: mockPush, replace: mockReplace, back: mockBack, canGoBack: () => mockCanGoBack }),
}));

// A roll loaded for Saturday 7 November at 7 pm, open for a week.
const roll = buildEvent({
  id: "roll-1",
  title: "Nadia turns 30",
  date: new Date(2026, 10, 7, 19).toISOString(),
  galleryState: "UPCOMING",
  galleryOpensAt: new Date(2026, 10, 7, 19).toISOString(),
  galleryClosesAt: new Date(2026, 10, 14, 19).toISOString(),
  galleryWindowDays: 7,
  usage: { members: 1, storageBytes: "0" },
  invites: [
    { accessLevel: "PARTICIPANT", invitationUrl: "https://everglow.social/join/adds" },
    { accessLevel: "VIEWER", invitationUrl: "https://everglow.social/join/view" },
  ],
});

const renderScreen = async ({ seeded = true } = {}) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  if (seeded) client.setQueryData(eventsKeys.detail("roll-1"), roll);
  await renderWithI18n(
    <QueryClientProvider client={client}>
      <RollLoadedScreen />
    </QueryClientProvider>,
  );
};

beforeEach(() => {
  mockFindOne.mockReset().mockResolvedValue({ data: { data: roll } });
  mockPush.mockReset();
  mockReplace.mockReset();
  mockBack.mockReset();
  mockCanGoBack = true;
});

test("fills the envelope in with the roll just loaded, and stamps it", async () => {
  await renderScreen();

  expect(screen.getByLabelText("Envelope for Nadia turns 30, Sat 7 Nov, 7 pm")).toBeOnTheScreen();
  for (const text of ["Nadia turns 30", "Sat 7 Nov, 7 pm", "Just you so far", "14 Nov, then it’s gone"]) {
    expect(screen.getByText(text)).toBeOnTheScreen();
  }
  // Guests who scan it join to add photos.
  expect(screen.getByLabelText("QR code: https://everglow.social/join/adds")).toBeOnTheScreen();
  expect(screen.getByText("Loaded", { includeHiddenElements: true })).toBeOnTheScreen();
  expect(mockFindOne).not.toHaveBeenCalled();
});

test("sends the envelope, or goes to the roll", async () => {
  await renderScreen();
  const user = userEvent.setup();

  await user.press(screen.getByRole("button", { name: "Send the envelope" }));
  expect(mockPush).toHaveBeenCalledWith("/events/roll-1/envelope");

  await user.press(screen.getByRole("button", { name: "Go to the roll" }));
  expect(mockReplace).toHaveBeenCalledWith("/events/roll-1");
});

test("closes back to Home", async () => {
  await renderScreen();
  const user = userEvent.setup();
  await user.press(screen.getByRole("button", { name: "Close" }));
  expect(mockBack).toHaveBeenCalledTimes(1);

  mockCanGoBack = false;
  await user.press(screen.getByRole("button", { name: "Close" }));
  expect(mockReplace).toHaveBeenCalledWith("/events");
});

test("loads the roll when it isn't cached, and still opens it if that fails", async () => {
  const pending = deferred<unknown>();
  mockFindOne.mockReturnValue(pending.promise);
  await renderScreen({ seeded: false });
  expect(screen.getByTestId("roll-loaded-loading")).toBeOnTheScreen();

  pending.reject(new Error("Network unavailable"));
  expect(await screen.findByText("The roll is loaded, but its envelope didn’t open.")).toBeOnTheScreen();
  expect(screen.queryByRole("button", { name: "Send the envelope" })).not.toBeOnTheScreen();
  await userEvent.setup().press(screen.getByRole("button", { name: "Go to the roll" }));
  expect(mockReplace).toHaveBeenCalledWith("/events/roll-1");
});
