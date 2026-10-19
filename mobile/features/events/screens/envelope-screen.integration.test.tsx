import "../testing/native-mocks";
// eslint-disable-next-line no-restricted-imports
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderWithI18n } from "@/testing/render";
import { screen, userEvent, waitFor } from "@testing-library/react-native";
// The share sheet, clipboard and alerts are the native boundary.
// eslint-disable-next-line no-restricted-imports
import { Alert, Clipboard, Share } from "react-native";
import EnvelopeScreen from "./envelope-screen";
import { buildEvent, buildParticipant } from "../testing/fixtures";

const mockFindOne = jest.fn();
const mockGetParticipants = jest.fn();
const mockRegenerate = jest.fn();
const mockBack = jest.fn();
const mockReplace = jest.fn();

jest.mock("@/lib/api/generated/client.gen", () => ({ client: { getConfig: () => ({}) } }));
jest.mock("@/lib/api/generated", () => ({
  eventsControllerFindOne: (...args: unknown[]) => mockFindOne(...args),
  eventsControllerGetParticipants: (...args: unknown[]) => mockGetParticipants(...args),
  eventsControllerRegenerateInvite: (...args: unknown[]) => mockRegenerate(...args),
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

const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
const share = jest.spyOn(Share, "share");
const copy = jest.spyOn(Clipboard, "setString").mockImplementation(() => {});

beforeEach(() => {
  jest.clearAllMocks();
  share.mockResolvedValue({ action: Share.sharedAction });
});

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
  expect(screen.getByText("Admits: view only")).toBeOnTheScreen();
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

test("05.3 shares the link of the envelope on the table", async () => {
  await renderScreen();
  await screen.findByLabelText("Adds-photos envelope for Nadia turns 30");
  const user = userEvent.setup();

  await user.press(screen.getByRole("tab", { name: "View only" }));
  await user.press(screen.getByRole("button", { name: "Share the link" }));

  expect(share).toHaveBeenCalledWith({
    message: "Nadia turns 30 · join the roll\nhttps://events.everglow.app/invite/weekend-viewer",
  });
});

test("copies the link", async () => {
  await renderScreen();
  await userEvent.setup().press(await screen.findByRole("button", { name: "Copy link" }));

  expect(copy).toHaveBeenCalledWith("https://events.everglow.app/invite/weekend");
  expect(screen.getByRole("button", { name: "Copied" })).toBeOnTheScreen();
});

test("05.5 resets the envelope after the slip, and the new code replaces the old", async () => {
  const fresh = "https://events.everglow.app/invite/fresh";
  mockRegenerate.mockResolvedValue({
    data: {
      data: {
        ...nadia,
        invitationUrl: fresh,
        invites: [{ ...nadia.invites[0], invitationUrl: fresh }, nadia.invites[1]],
      },
    },
  });
  await renderScreen();
  const user = userEvent.setup();

  await user.press(await screen.findByRole("button", { name: "Reset the adds-photos envelope" }));
  expect(screen.getByRole("header", { name: "Reset this envelope?" })).toBeOnTheScreen();
  expect(
    screen.getByText(
      "The current QR and link stop working at once and you get new ones. The view-only envelope keeps working, and the 18 people already in stay.",
    ),
  ).toBeOnTheScreen();

  await user.press(screen.getByRole("button", { name: "Reset it" }));

  expect(mockRegenerate).toHaveBeenCalledWith({
    path: { eventId: "event-1", accessLevel: "PARTICIPANT" },
    throwOnError: true,
  });
  expect(await screen.findByLabelText(`QR code: ${fresh}`)).toBeOnTheScreen();
  await waitFor(() => expect(screen.queryByRole("header", { name: "Reset this envelope?" })).not.toBeOnTheScreen());
});

test("keeping the envelope leaves the link as it was", async () => {
  await renderScreen();
  const user = userEvent.setup();

  await user.press(await screen.findByRole("button", { name: "Reset the adds-photos envelope" }));
  await user.press(screen.getByRole("button", { name: "Keep it" }));

  expect(mockRegenerate).not.toHaveBeenCalled();
  expect(screen.getByLabelText("QR code: https://events.everglow.app/invite/weekend")).toBeOnTheScreen();
});

test("a reset that fails says so and keeps the old code", async () => {
  mockRegenerate.mockRejectedValue(new Error("Too many requests"));
  await renderScreen();
  const user = userEvent.setup();

  await user.press(await screen.findByRole("button", { name: "Reset the adds-photos envelope" }));
  await user.press(screen.getByRole("button", { name: "Reset it" }));

  await waitFor(() => expect(alert).toHaveBeenCalledWith("Couldn’t reset the envelope", expect.any(String)));
  expect(screen.getByLabelText("QR code: https://events.everglow.app/invite/weekend")).toBeOnTheScreen();
});
