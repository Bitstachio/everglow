import "../testing/native-mocks";
// eslint-disable-next-line no-restricted-imports
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, userEvent, waitFor } from "@testing-library/react-native";
// eslint-disable-next-line no-restricted-imports
import { Alert } from "react-native";
import EventSettingsScreen from "./event-settings-screen";
import { buildEvent, buildParticipant } from "../testing/fixtures";
import { createApiError } from "@/lib/api/errors";
import { formatEnvelopeDay } from "../lib/envelope";
import { formatOpensAt } from "../lib/roll-page";

const mockFindOne = jest.fn();
const mockGetParticipants = jest.fn();
const mockUpdate = jest.fn();
const mockRemove = jest.fn();
const mockDismissAll = jest.fn();
const mockReplace = jest.fn();
const mockLimits = jest.fn();
const mockBack = jest.fn();
const mockPush = jest.fn();

let mockUser: { id: string } | null = { id: "user-1" };
let mockEventId: string | string[] = "event-1";

jest.mock("@/lib/api/generated/client.gen", () => ({ client: { getConfig: () => ({}) } }));
jest.mock("@/lib/api/generated", () => ({
  eventsControllerFindOne: (...args: unknown[]) => mockFindOne(...args),
  eventsControllerGetParticipants: (...args: unknown[]) => mockGetParticipants(...args),
  eventsControllerUpdate: (...args: unknown[]) => mockUpdate(...args),
  eventsControllerRemove: (...args: unknown[]) => mockRemove(...args),
  usersControllerGetMyLimits: (...args: unknown[]) => mockLimits(...args),
}));
jest.mock("@/context/auth-context", () => ({ useAuth: () => ({ user: mockUser }) }));
jest.mock("expo-router", () => ({
  useRouter: () => ({ back: mockBack, push: mockPush, dismissAll: mockDismissAll, replace: mockReplace }),
  useLocalSearchParams: () => ({ id: mockEventId }),
}));
jest.mock("@/hooks/use-reduce-motion", () => ({ useReduceMotion: () => true }));

const clients: QueryClient[] = [];

const limits = () => ({
  data: {
    data: {
      plan: "FREE",
      limits: { activeEvents: 2 },
      usage: { activeEvents: 0 },
      nextClosingEvent: null,
      newEvent: {
        plan: "FREE",
        galleryWindowOptions: [3, 7, 14, 30],
        defaultGalleryWindowDays: 30,
        latestDate: new Date(2027, 10, 1, 9, 41).toISOString(),
      },
    },
  },
});

const renderScreen = async (event = buildEvent(), participants = [buildParticipant()]) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: 0 } },
  });
  clients.push(client);
  mockFindOne.mockResolvedValue({ data: { data: event } });
  mockGetParticipants.mockResolvedValue({ data: { data: participants } });
  mockLimits.mockResolvedValue(limits());
  mockUpdate.mockResolvedValue({ data: { data: event } });
  await render(
    <QueryClientProvider client={client}>
      <EventSettingsScreen />
    </QueryClientProvider>,
  );
  return client;
};

beforeEach(() => {
  mockUser = { id: "user-1" };
  mockEventId = "event-1";
  mockFindOne.mockReset();
  mockGetParticipants.mockReset();
  mockUpdate.mockReset();
  mockRemove.mockReset();
  mockDismissAll.mockReset();
  mockReplace.mockReset();
  mockLimits.mockReset();
  mockBack.mockReset();
  mockPush.mockReset();
  jest.spyOn(Alert, "alert").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
  clients.splice(0).forEach((client) => client.clear());
});

test("upcoming: every schedule row can still change", async () => {
  const event = buildEvent({
    galleryState: "UPCOMING",
    galleryOpensAt: "2026-11-07T19:00:00.000Z",
    galleryWindowDays: 7,
    coverUrl: null,
    description: null,
  });
  await renderScreen(event);

  expect(await screen.findByText("Roll settings")).toBeOnTheScreen();
  expect(screen.getByText(event.title)).toBeOnTheScreen();
  expect(screen.getByText(`Opens ${formatOpensAt(event.galleryOpensAt)}`)).toBeOnTheScreen();

  expect(screen.getByRole("button", { name: `Name, ${event.title}` })).toBeOnTheScreen();
  expect(screen.getByRole("button", { name: "Cover, Add" })).toBeOnTheScreen();
  expect(screen.getByRole("button", { name: "Note for guests, Add" })).toBeOnTheScreen();
  expect(screen.getByRole("button", { name: `When, ${formatOpensAt(event.date)}` })).toBeOnTheScreen();
  expect(screen.getByRole("button", { name: "Film, 7-day roll" })).toBeOnTheScreen();
  expect(screen.getByLabelText("Storage, 0 of 3 GB")).toBeOnTheScreen();
  expect(screen.getByRole("button", { name: "Envelopes, Two · reset" })).toBeOnTheScreen();
  expect(screen.getByLabelText("Delete the roll, After it closes")).toBeOnTheScreen();
  expect(screen.queryByText(/locked once the gallery opens/)).toBeNull();
});

test("open: date and film are locked and explain why", async () => {
  const event = buildEvent({
    galleryState: "OPEN",
    galleryClosesAt: "2026-11-17T16:00:00.000Z",
    galleryWindowDays: 30,
    coverUrl: "https://cdn.example.com/cover.jpg",
    description: "Black tie",
  });
  await renderScreen(event);

  expect(await screen.findByText(`Open · until ${formatEnvelopeDay(event.galleryClosesAt!)}`)).toBeOnTheScreen();
  expect(screen.getByRole("button", { name: "Cover, Change" })).toBeOnTheScreen();
  expect(screen.getByRole("button", { name: "Note for guests, Black tie" })).toBeOnTheScreen();
  expect(screen.getByLabelText(`When, ${formatOpensAt(event.date)} · locked`)).toBeOnTheScreen();
  expect(screen.getByLabelText("Film, 30-day roll · locked")).toBeOnTheScreen();
  expect(screen.getByText(/locked once the gallery opens/)).toBeOnTheScreen();
});

test("opens name and note editors from the index", async () => {
  await renderScreen(buildEvent({ galleryState: "UPCOMING" }));
  const user = userEvent.setup();
  await user.press(await screen.findByRole("button", { name: `Name, Weekend meetup` }));
  expect(mockPush).toHaveBeenCalledWith("/events/event-1/edit-title");
  await user.press(screen.getByRole("button", { name: "Note for guests, An afternoon with friends" }));
  expect(mockPush).toHaveBeenCalledWith("/events/event-1/edit-description");
});

test("opens the cover menu to add a photo", async () => {
  const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
  await renderScreen(buildEvent({ galleryState: "UPCOMING", coverUrl: null }));
  await userEvent.setup().press(await screen.findByRole("button", { name: "Cover, Add" }));
  expect(alert).toHaveBeenCalledWith(
    "Cover",
    undefined,
    expect.arrayContaining([
      expect.objectContaining({ text: "Take a photo" }),
      expect.objectContaining({ text: "Choose from Photos" }),
      expect.objectContaining({ text: "Cancel" }),
    ]),
  );
  const buttons = alert.mock.calls[0][2] as { text?: string }[];
  expect(buttons.map((button) => button.text)).not.toContain("Remove the cover");
});

test("offers remove when the roll already has a cover", async () => {
  const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
  await renderScreen(buildEvent({ galleryState: "OPEN", coverUrl: "https://cdn.example.com/cover.jpg" }));
  await userEvent.setup().press(await screen.findByRole("button", { name: "Cover, Change" }));
  const buttons = alert.mock.calls[0][2] as { text?: string }[];
  expect(buttons.map((button) => button.text)).toContain("Remove the cover");
});

test("opens when and film slips while upcoming", async () => {
  await renderScreen(
    buildEvent({
      galleryState: "UPCOMING",
      galleryWindowDays: 7,
      date: "2026-11-07T19:00:00.000Z",
    }),
  );
  const user = userEvent.setup();

  await user.press(await screen.findByRole("button", { name: `When, ${formatOpensAt("2026-11-07T19:00:00.000Z")}` }));
  expect(await screen.findByText("When it happens")).toBeOnTheScreen();
  // Only the host is on the roll, so nobody else will see the move.
  expect(screen.queryByText(/will see the new date/)).toBeNull();

  await user.press(screen.getByLabelText("Dismiss"));
  await waitFor(() => expect(screen.queryByText("When it happens")).toBeNull());
  await user.press(screen.getByRole("button", { name: "Film, 7-day roll" }));
  expect(await screen.findByLabelText("A week, 7-day roll")).toBeOnTheScreen();
  expect(screen.getByRole("button", { name: "Save" })).toBeOnTheScreen();
});

test("saves a new film from the slip", async () => {
  const event = buildEvent({
    galleryState: "UPCOMING",
    galleryWindowDays: 7,
    galleryWindowOptions: [3, 7, 14, 30],
  });
  mockUpdate.mockResolvedValue({ data: { data: { ...event, galleryWindowDays: 14 } } });
  await renderScreen(event);
  const user = userEvent.setup();

  await user.press(await screen.findByRole("button", { name: "Film, 7-day roll" }));
  await user.press(await screen.findByLabelText("Two weeks, 14-day roll"));
  await user.press(screen.getByRole("button", { name: "Save" }));

  await waitFor(() =>
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ path: { eventId: "event-1" }, body: { galleryWindowDays: 14 } }),
    ),
  );
});

test("sends non-hosts back", async () => {
  mockUser = { id: "user-2" };
  mockFindOne.mockResolvedValue({ data: { data: buildEvent({ creatorId: "user-1" }) } });
  mockGetParticipants.mockResolvedValue({
    data: {
      data: [buildParticipant(), buildParticipant({ userId: "user-2", name: "Guest", accessLevel: "PARTICIPANT" })],
    },
  });
  mockLimits.mockResolvedValue(limits());
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: 0 } },
  });
  clients.push(client);
  await render(
    <QueryClientProvider client={client}>
      <EventSettingsScreen />
    </QueryClientProvider>,
  );

  await waitFor(() => expect(mockBack).toHaveBeenCalled());
});

test("a move names everyone else on the roll", async () => {
  await renderScreen(buildEvent({ galleryState: "UPCOMING", date: "2026-11-07T19:00:00.000Z" }), [
    buildParticipant(),
    buildParticipant({ userId: "user-2", name: "Grace", accessLevel: "PARTICIPANT" }),
    buildParticipant({ userId: "user-3", name: "Alan", accessLevel: "VIEWER" }),
  ]);
  await userEvent
    .setup()
    .press(await screen.findByRole("button", { name: `When, ${formatOpensAt("2026-11-07T19:00:00.000Z")}` }));
  expect(await screen.findByText("2 people will see the new date.")).toBeOnTheScreen();
});

test("when waits for the account's latest date before it opens", async () => {
  mockLimits.mockReturnValue(new Promise(() => {}));
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: 0 } },
  });
  clients.push(client);
  mockFindOne.mockResolvedValue({ data: { data: buildEvent({ galleryState: "UPCOMING" }) } });
  mockGetParticipants.mockResolvedValue({ data: { data: [buildParticipant()] } });
  await render(
    <QueryClientProvider client={client}>
      <EventSettingsScreen />
    </QueryClientProvider>,
  );
  const when = await screen.findByLabelText(/^When, /);
  expect(when).not.toHaveProp("accessibilityRole", "button");
});

test("envelopes opens the roll's envelopes", async () => {
  await renderScreen(buildEvent({ galleryState: "OPEN" }));
  await userEvent.setup().press(await screen.findByRole("button", { name: "Envelopes, Two · reset" }));
  expect(mockPush).toHaveBeenCalledWith("/events/event-1/envelope");
});

describe("a closed roll", () => {
  const closed = () =>
    buildEvent({
      title: "Lake weekend",
      galleryState: "CLOSED",
      galleryClosesAt: new Date(2026, 8, 21, 12, 0).toISOString(),
      usage: { members: 11, storageBytes: "0" },
    });

  test("says when it closed and keeps the schedule locked without the open-roll note", async () => {
    await renderScreen(closed());
    expect(await screen.findByText("Closed 21.09")).toBeOnTheScreen();
    expect(screen.getByLabelText(/^Film, .* · locked$/)).toBeOnTheScreen();
    expect(screen.queryByText(/locked once the gallery opens/)).toBeNull();
  });

  test("deletes the roll from its slip and goes Home", async () => {
    mockRemove.mockResolvedValue({ data: undefined });
    await renderScreen(closed());
    const user = userEvent.setup();
    await user.press(await screen.findByRole("button", { name: "Delete the roll" }));

    expect(await screen.findByText("Closed 21.09 · 11 people")).toBeOnTheScreen();
    expect(screen.getByText(/for all 11 people/)).toBeOnTheScreen();
    // iOS reports the dismissal through the Modal once the sheet has gone, and
    // the sheet leaves the tree when its close animation ends, so take the
    // callback while the slip is open rather than racing that animation.
    const { onDismiss } = screen.getByTestId("delete-roll-dialog").props as { onDismiss: () => void };
    await user.press(screen.getByRole("button", { name: "Delete Lake weekend" }));

    await waitFor(() => expect(mockRemove).toHaveBeenCalled());
    // Home only once the slip has gone: a dismissal while it is still open does nothing.
    expect(mockReplace).not.toHaveBeenCalled();
    await waitFor(() => {
      onDismiss();
      expect(mockDismissAll).toHaveBeenCalled();
    });
    expect(mockReplace).toHaveBeenCalledWith("/events");
    expect(mockRemove).toHaveBeenCalledWith(expect.objectContaining({ path: { eventId: "event-1" } }));
  });

  test("a refused delete says why and stays", async () => {
    mockRemove.mockRejectedValue(createApiError("Forbidden", { status: 403, code: "EVENT_HAS_OPEN_REPORTS" }));
    await renderScreen(closed());
    const user = userEvent.setup();
    await user.press(await screen.findByRole("button", { name: "Delete the roll" }));
    await user.press(await screen.findByRole("button", { name: "Delete Lake weekend" }));

    expect(await screen.findByText(/reports waiting for a decision/)).toBeOnTheScreen();
    expect(mockReplace).not.toHaveBeenCalled();
  });
});

test("an open roll can't be deleted from settings yet", async () => {
  await renderScreen(buildEvent({ galleryState: "OPEN" }));
  expect(await screen.findByLabelText("Delete the roll, After it closes")).toBeOnTheScreen();
  expect(screen.queryByRole("button", { name: /Delete the roll/ })).toBeNull();
});

test("a film change refused because the roll opened says so and reloads the roll", async () => {
  const event = buildEvent({ galleryState: "UPCOMING", galleryWindowDays: 7, galleryWindowOptions: [3, 7, 14, 30] });
  await renderScreen(event);
  mockUpdate.mockRejectedValue(createApiError("Locked", { status: 409, code: "EVENT_SCHEDULE_LOCKED" }));
  const user = userEvent.setup();

  await user.press(await screen.findByRole("button", { name: "Film, 7-day roll" }));
  await user.press(await screen.findByLabelText("Two weeks, 14-day roll"));
  await user.press(screen.getByRole("button", { name: "Save" }));

  expect(await screen.findByText("The date and film can only change before the roll opens.")).toBeOnTheScreen();
  await waitFor(() => expect(mockFindOne).toHaveBeenCalledTimes(2));
});
