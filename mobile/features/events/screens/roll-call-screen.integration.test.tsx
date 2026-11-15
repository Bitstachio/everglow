// The integration harness supplies the real data provider.
// eslint-disable-next-line no-restricted-imports
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, screen, userEvent, waitFor, within } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { createApiError } from "@/lib/api/errors";
import { renderWithI18n } from "@/testing/render";
import RollCallScreen from "./roll-call-screen";
import { buildEvent, buildParticipant } from "../testing/fixtures";

const mockFindOne = jest.fn();
const mockGetParticipants = jest.fn();
const mockListBans = jest.fn();
const mockUpdateAccess = jest.fn();
const mockRemoveParticipant = jest.fn();
const mockBlock = jest.fn();
const mockUnblock = jest.fn();
const mockPush = jest.fn();
const mockBack = jest.fn();
let mockUser: { id: string } = { id: "user-1" };

jest.mock("@/lib/api/generated/client.gen", () => ({ client: { getConfig: () => ({}) } }));
jest.mock("@/lib/api/generated", () => ({
  eventsControllerFindOne: (...args: unknown[]) => mockFindOne(...args),
  eventsControllerGetParticipants: (...args: unknown[]) => mockGetParticipants(...args),
  eventsControllerListBans: (...args: unknown[]) => mockListBans(...args),
  eventsControllerUpdateParticipantAccess: (...args: unknown[]) => mockUpdateAccess(...args),
  eventsControllerRemoveParticipant: (...args: unknown[]) => mockRemoveParticipant(...args),
  blocksControllerBlock: (...args: unknown[]) => mockBlock(...args),
  blocksControllerUnblock: (...args: unknown[]) => mockUnblock(...args),
}));
jest.mock("@/hooks/use-reduce-motion", () => ({ useReduceMotion: () => true }));
jest.mock("@/context/auth-context", () => ({ useAuth: () => ({ user: mockUser }) }));
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, back: mockBack, replace: jest.fn(), canGoBack: () => true }),
  useLocalSearchParams: () => ({ id: "event-1" }),
}));

const initialMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const sam = buildParticipant({ userId: "user-1", name: "Sam Rivera", username: "sam" });
const leila = buildParticipant({
  userId: "user-2",
  name: "Leila Haddad",
  username: "leila.h",
  accessLevel: "PARTICIPANT",
  photoCount: 31,
});
const marcus = buildParticipant({ userId: "user-3", name: "Marcus Bell", username: "marcus", accessLevel: "VIEWER" });
const jo = buildParticipant({ userId: "user-4", name: "Jo Okafor", username: "jo" });

const wedding = (overrides: Parameters<typeof buildEvent>[0] = {}) =>
  buildEvent({ title: "Sam & Jo’s wedding", usage: { members: 24, storageBytes: "0" }, ...overrides });

type Seed = {
  event?: ReturnType<typeof buildEvent>;
  participants?: ReturnType<typeof buildParticipant>[];
  bans?: unknown[];
};

const renderScreen = async ({ event = wedding(), participants = [marcus, leila, sam], bans = [] }: Seed = {}) => {
  mockFindOne.mockResolvedValue({ data: { data: event } });
  mockGetParticipants.mockResolvedValue({ data: { data: participants } });
  mockListBans.mockResolvedValue({ data: { data: { items: bans } } });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false, gcTime: 0 } },
  });
  await renderWithI18n(
    <SafeAreaProvider initialMetrics={initialMetrics}>
      <QueryClientProvider client={client}>
        <RollCallScreen />
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
  await screen.findByRole("header", { name: "Roll call" });
};

const openPerson = async (name: RegExp) => {
  const user = userEvent.setup();
  await user.press(await screen.findByRole("button", { name }));
  return user;
};

beforeEach(() => {
  jest.clearAllMocks();
  mockUser = { id: "user-1" };
  mockUpdateAccess.mockResolvedValue({});
  mockRemoveParticipant.mockResolvedValue({});
  mockBlock.mockResolvedValue({});
  mockUnblock.mockResolvedValue({});
});

describe("11.1 the roll call, as a host", () => {
  test("numbers everyone, hosts first, under the roll's name and how full it is", async () => {
    await renderScreen({ bans: [{ userId: "user-9", name: "Dan Ruiz", username: "dan", bannedAt: "" }] });

    expect(screen.getByRole("header", { name: "Sam & Jo’s wedding" })).toBeOnTheScreen();
    expect(screen.getByLabelText("24 of 30 on the roll, 6 spots left")).toBeOnTheScreen();
    const rows = within(screen.getByTestId("roll-people")).getAllByRole("button");
    expect(rows.map((row) => row.props.accessibilityLabel)).toEqual([
      "Sam Rivera (you), Host",
      "Marcus Bell, View only",
      "Leila Haddad, Adds photos",
    ]);
    expect(screen.getByRole("button", { name: "Send the envelope" })).toBeOnTheScreen();
    expect(await screen.findByRole("button", { name: "1 person removed" })).toBeOnTheScreen();
  });

  test("a full roll says so", async () => {
    await renderScreen({ event: wedding({ usage: { members: 30, storageBytes: "0" } }) });
    expect(screen.getByLabelText("30 of 30 on the roll, Full left")).toBeOnTheScreen();
  });

  test("the envelope and the removed people are a tap away", async () => {
    await renderScreen({ bans: [{ userId: "user-9", name: "Dan Ruiz", username: "dan", bannedAt: "" }] });
    const user = userEvent.setup();
    await user.press(screen.getByRole("button", { name: "Send the envelope" }));
    expect(mockPush).toHaveBeenCalledWith("/events/event-1/envelope");
    await user.press(await screen.findByRole("button", { name: "1 person removed" }));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/events/[id]/removed", params: { id: "event-1" } });
  });

  test("a closed roll takes nobody new: no envelope", async () => {
    await renderScreen({ event: wedding({ galleryState: "CLOSED" }) });
    expect(screen.queryByRole("button", { name: "Send the envelope" })).not.toBeOnTheScreen();
  });

  test("your own row does nothing", async () => {
    await renderScreen();
    expect(screen.getByRole("button", { name: "Sam Rivera (you), Host" })).toBeDisabled();
  });
});

describe("11.2–11.4 a person, as a host", () => {
  test("shows their handle, role and frames, with every host action", async () => {
    await renderScreen();
    await openPerson(/Leila Haddad/);

    const menu = await screen.findByTestId("person-menu");
    expect(within(menu).getByText("@leila.h · Adds photos · 31 frames")).toBeOnTheScreen();
    for (const action of ["Change role", "Report Leila", "Block Leila", "Remove from the roll"]) {
      expect(within(menu).getByRole("button", { name: action })).toBeOnTheScreen();
    }
  });

  test("changes a role, refreshes the roll call and says so (11.3)", async () => {
    await renderScreen();
    const user = await openPerson(/Leila Haddad/);
    await user.press(await screen.findByRole("button", { name: "Change role" }));

    expect(await screen.findByRole("header", { name: "Their role on this roll" })).toBeOnTheScreen();
    expect(screen.getByRole("radio", { name: /Adds photos/ })).toBeChecked();
    mockGetParticipants.mockResolvedValue({ data: { data: [marcus, { ...leila, accessLevel: "VIEWER" }, sam] } });
    await user.press(screen.getByRole("radio", { name: /View only/ }));
    await user.press(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(mockUpdateAccess).toHaveBeenCalledWith({
        path: { eventId: "event-1", targetUserId: "user-2" },
        body: { accessLevel: "VIEWER" },
        throwOnError: true,
      }),
    );
    expect(await screen.findByText("Leila is view only now.")).toBeOnTheScreen();
    expect(await screen.findByRole("button", { name: "Leila Haddad, View only" })).toBeOnTheScreen();
  });

  test("making someone a host asks first", async () => {
    await renderScreen();
    const user = await openPerson(/Leila Haddad/);
    await user.press(await screen.findByRole("button", { name: "Change role" }));
    await user.press(await screen.findByRole("radio", { name: /^Host/ }));
    await user.press(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("header", { name: "Make Leila a host?" })).toBeOnTheScreen();
    expect(mockUpdateAccess).not.toHaveBeenCalled();
    await user.press(screen.getByRole("button", { name: "Make Leila host" }));

    await waitFor(() =>
      expect(mockUpdateAccess).toHaveBeenCalledWith(expect.objectContaining({ body: { accessLevel: "ORGANIZER" } })),
    );
    expect(await screen.findByText("Leila is a host now.")).toBeOnTheScreen();
  });

  test("keeping the same role saves nothing", async () => {
    await renderScreen();
    const user = await openPerson(/Leila Haddad/);
    await user.press(await screen.findByRole("button", { name: "Change role" }));
    await user.press(await screen.findByRole("button", { name: "Save" }));

    await waitFor(() => expect(screen.queryByRole("header", { name: "Their role on this roll" })).toBeNull());
    expect(mockUpdateAccess).not.toHaveBeenCalled();
  });

  test("a failed change stays on the slip to try again", async () => {
    mockUpdateAccess.mockRejectedValueOnce(new Error("Offline"));
    await renderScreen();
    const user = await openPerson(/Leila Haddad/);
    await user.press(await screen.findByRole("button", { name: "Change role" }));
    await user.press(await screen.findByRole("radio", { name: /View only/ }));
    await user.press(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("alert")).toBeOnTheScreen();
    expect(screen.getByRole("header", { name: "Their role on this roll" })).toBeOnTheScreen();
  });

  test("stepping the last other host down is refused with the last-host slip (11.6)", async () => {
    mockUpdateAccess.mockRejectedValueOnce(createApiError("last", { status: 422, code: "LAST_ORGANIZER" }));
    await renderScreen({ participants: [sam, jo, leila] });
    const user = await openPerson(/Jo Okafor/);
    await user.press(await screen.findByRole("button", { name: "Change role" }));
    await user.press(await screen.findByRole("radio", { name: /Adds photos/ }));
    await user.press(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("header", { name: "Make someone else host first." })).toBeOnTheScreen();
    await user.press(screen.getByRole("button", { name: "Choose a new host" }));
    await waitFor(() => expect(screen.queryByRole("header", { name: "Make someone else host first." })).toBeNull());
  });

  test("removes someone, choosing what happens to their frames (11.4)", async () => {
    await renderScreen();
    const user = await openPerson(/Leila Haddad/);
    await user.press(await screen.findByRole("button", { name: "Remove from the roll" }));

    expect(await screen.findByRole("header", { name: "What about their 31 frames?" })).toBeOnTheScreen();
    await user.press(screen.getByRole("radio", { name: /Delete them too/ }));
    await user.press(screen.getByRole("button", { name: "Remove Leila" }));

    await waitFor(() =>
      expect(mockRemoveParticipant).toHaveBeenCalledWith({
        path: { eventId: "event-1", targetUserId: "user-2" },
        query: { photos: "DELETE" },
        throwOnError: true,
      }),
    );
    expect(await screen.findByText("Leila Haddad is off the roll.")).toBeOnTheScreen();
    await waitFor(() => expect(mockListBans).toHaveBeenCalledTimes(2));
  });

  test("Cancel goes back to their actions", async () => {
    await renderScreen();
    const user = await openPerson(/Leila Haddad/);
    await user.press(await screen.findByRole("button", { name: "Remove from the roll" }));
    await user.press(await screen.findByRole("button", { name: "Cancel" }));
    expect(await screen.findByTestId("person-menu")).toBeOnTheScreen();
  });
});

describe("blocking and reporting from the roll call (11.8, 10.11)", () => {
  test("blocks someone", async () => {
    await renderScreen();
    const user = await openPerson(/Leila Haddad/);
    await user.press(await screen.findByRole("button", { name: "Block Leila" }));
    expect(await screen.findByText("You won’t see each other.")).toBeOnTheScreen();
    await user.press(screen.getByRole("button", { name: "Block Leila" }));

    await waitFor(() => expect(mockBlock).toHaveBeenCalledWith({ path: { userId: "user-2" }, throwOnError: true }));
    expect(await screen.findByText("Leila Haddad is blocked")).toBeOnTheScreen();
  });

  test("unblocks someone already blocked", async () => {
    await renderScreen({ participants: [sam, { ...leila, isBlockedByCaller: true }] });
    const user = await openPerson(/Leila Haddad/);
    expect(screen.queryByRole("button", { name: "Block Leila" })).not.toBeOnTheScreen();
    await user.press(await screen.findByRole("button", { name: "Unblock Leila" }));

    await waitFor(() => expect(mockUnblock).toHaveBeenCalledWith({ path: { userId: "user-2" }, throwOnError: true }));
    expect(await screen.findByText("Leila Haddad is unblocked")).toBeOnTheScreen();
  });

  test("reports someone once the sheet has gone", async () => {
    await renderScreen();
    const user = await openPerson(/Leila Haddad/);
    const nativeDismiss = screen.getByTestId("roll-call-dialog", { includeHiddenElements: true }).props.onDismiss;
    await user.press(await screen.findByRole("button", { name: "Report Leila" }));

    expect(mockPush).not.toHaveBeenCalled();
    await act(async () => nativeDismiss());
    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/events/[id]/report",
      params: { id: "event-1", userId: "user-2" },
    });
  });
});

describe("11.7 the roll call, as a guest", () => {
  beforeEach(() => {
    mockUser = { id: "user-2" };
  });

  test("the same list, without the removed people or the envelope", async () => {
    await renderScreen();

    expect(screen.getByRole("button", { name: "Leila Haddad (you), Adds photos" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Send the envelope" })).not.toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: /removed/ })).not.toBeOnTheScreen();
    expect(mockListBans).not.toHaveBeenCalled();
  });

  test("a person offers only report and block (11.8)", async () => {
    await renderScreen();
    await openPerson(/Sam Rivera/);

    const menu = await screen.findByTestId("person-menu");
    expect(within(menu).getByRole("button", { name: "Report Sam" })).toBeOnTheScreen();
    expect(within(menu).getByRole("button", { name: "Block Sam" })).toBeOnTheScreen();
    expect(within(menu).queryByRole("button", { name: "Change role" })).not.toBeOnTheScreen();
    expect(within(menu).queryByRole("button", { name: "Remove from the roll" })).not.toBeOnTheScreen();
  });
});

describe("states", () => {
  test("a roll on hold only shows who is on it, even to a host", async () => {
    await renderScreen({ event: wedding({ status: "UNDER_REVIEW" }) });
    await openPerson(/Leila Haddad/);

    const menu = await screen.findByTestId("person-menu");
    expect(within(menu).queryByRole("button", { name: "Change role" })).not.toBeOnTheScreen();
    expect(within(menu).queryByRole("button", { name: "Remove from the roll" })).not.toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Send the envelope" })).not.toBeOnTheScreen();
  });

  test("a roll call that didn't load can be tried again", async () => {
    mockGetParticipants.mockRejectedValueOnce(new Error("Offline"));
    mockFindOne.mockResolvedValue({ data: { data: wedding() } });
    mockListBans.mockResolvedValue({ data: { data: { items: [] } } });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    await renderWithI18n(
      <SafeAreaProvider initialMetrics={initialMetrics}>
        <QueryClientProvider client={client}>
          <RollCallScreen />
        </QueryClientProvider>
      </SafeAreaProvider>,
    );

    expect(await screen.findByText("Couldn’t load the roll call.")).toBeOnTheScreen();
    mockGetParticipants.mockResolvedValue({ data: { data: [sam, leila] } });
    await userEvent.setup().press(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("button", { name: "Leila Haddad, Adds photos" })).toBeOnTheScreen();
  });

  test("Back returns to the roll", async () => {
    await renderScreen();
    await userEvent.setup().press(screen.getByRole("button", { name: "Back" }));
    expect(mockBack).toHaveBeenCalled();
  });
});
