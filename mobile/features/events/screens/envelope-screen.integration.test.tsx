import "../testing/native-mocks";
// eslint-disable-next-line no-restricted-imports
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderWithI18n } from "@/testing/render";
import { screen, userEvent } from "@testing-library/react-native";
import EnvelopeScreen from "./envelope-screen";
import { buildEvent, buildParticipant } from "../testing/fixtures";

const mockFindOne = jest.fn();
const mockGetParticipants = jest.fn();
const mockBack = jest.fn();
const mockReplace = jest.fn();

jest.mock("@/lib/api/generated/client.gen", () => ({ client: { getConfig: () => ({}) } }));
jest.mock("@/lib/api/generated", () => ({
  eventsControllerFindOne: (...args: unknown[]) => mockFindOne(...args),
  eventsControllerGetParticipants: (...args: unknown[]) => mockGetParticipants(...args),
}));
jest.mock("@/context/auth-context", () => ({ useAuth: () => ({ user: { id: "user-1" } }) }));
jest.mock("expo-router", () => ({
  useRouter: () => ({ back: mockBack, replace: mockReplace, canGoBack: () => true }),
  useLocalSearchParams: () => ({ id: "event-1" }),
}));

const nadia = buildEvent({
  title: "Nadia turns 30",
  date: new Date(2026, 10, 7, 19, 0).toISOString(),
  galleryClosesAt: new Date(2026, 10, 14, 19, 0).toISOString(),
  usage: { members: 18, storageBytes: "0" },
});

const renderScreen = async (event = nadia, participants = [buildParticipant()]) => {
  mockFindOne.mockResolvedValue({ data: { data: event } });
  mockGetParticipants.mockResolvedValue({ data: { data: participants } });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: 0 } },
  });
  await renderWithI18n(
    <QueryClientProvider client={client}>
      <EnvelopeScreen />
    </QueryClientProvider>,
  );
  return client;
};

beforeEach(() => jest.clearAllMocks());

test("05.1 shows the adds-photos envelope with its code", async () => {
  await renderScreen();

  expect(await screen.findByLabelText("Adds-photos envelope for Nadia turns 30")).toBeOnTheScreen();
  expect(screen.getByRole("header", { name: "Envelope · Nadia turns 30" })).toBeOnTheScreen();
  expect(screen.getByRole("tab", { name: "Adds photos", selected: true })).toBeOnTheScreen();
  expect(screen.getByText("Sat 7 Nov, 7 pm")).toBeOnTheScreen();
  expect(screen.getByText("18 people so far")).toBeOnTheScreen();
  expect(screen.getByText("14 Nov, then it’s gone")).toBeOnTheScreen();
  expect(screen.getByLabelText("QR code: https://events.everglow.app/invite/weekend")).toBeOnTheScreen();
});

test("05.2 switches to the view-only envelope", async () => {
  await renderScreen();
  await screen.findByLabelText("Adds-photos envelope for Nadia turns 30");

  await userEvent.setup().press(screen.getByRole("tab", { name: "View only" }));

  expect(screen.getByLabelText("View-only envelope for Nadia turns 30")).toBeOnTheScreen();
  expect(screen.getByRole("tab", { name: "View only", selected: true })).toBeOnTheScreen();
  expect(screen.getByLabelText("QR code: https://events.everglow.app/invite/weekend-viewer")).toBeOnTheScreen();
});

test("shows a blank envelope while the roll loads", async () => {
  mockFindOne.mockReturnValue(new Promise(() => {}));
  mockGetParticipants.mockReturnValue(new Promise(() => {}));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await renderWithI18n(
    <QueryClientProvider client={client}>
      <EnvelopeScreen />
    </QueryClientProvider>,
  );

  expect(screen.getByTestId("envelope-loading")).toBeOnTheScreen();
});

test("says when the envelope couldn't load, and tries again", async () => {
  mockFindOne.mockRejectedValueOnce(new Error("Offline"));
  mockGetParticipants.mockResolvedValue({ data: { data: [buildParticipant()] } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await renderWithI18n(
    <QueryClientProvider client={client}>
      <EnvelopeScreen />
    </QueryClientProvider>,
  );

  expect(await screen.findByText("Couldn’t load the envelope.")).toBeOnTheScreen();
  mockFindOne.mockResolvedValue({ data: { data: nadia } });
  await userEvent.setup().press(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByLabelText("Adds-photos envelope for Nadia turns 30")).toBeOnTheScreen();
});

test("a guest is sent back to the roll", async () => {
  await renderScreen(buildEvent({ invites: [] }), [buildParticipant({ accessLevel: "VIEWER" })]);

  await screen.findByTestId("envelope-loading");
  await screen.findByRole("header", { name: "Envelope · Weekend meetup" });
  expect(mockReplace).toHaveBeenCalledWith("/events/event-1");
  expect(screen.queryByRole("tab")).not.toBeOnTheScreen();
});

test("closing goes back", async () => {
  await renderScreen();
  await userEvent.setup().press(await screen.findByRole("button", { name: "Close the envelope" }));
  expect(mockBack).toHaveBeenCalledTimes(1);
});
