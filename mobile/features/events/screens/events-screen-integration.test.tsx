import { mockCameraPermission, mockColorScheme } from "../testing/native-mocks";
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
const mockJoin = jest.fn();
const mockPush = jest.fn();
let mockUser: { id: string } | null = { id: "user-1" };
let mockFocused = true;
jest.mock("@/lib/api/generated/client.gen", () => ({ client: { getConfig: () => ({}) } }));
jest.mock("@/lib/api/generated", () => ({
  eventsControllerFindAll: (...args: unknown[]) => mockFindAll(...args),
  eventsControllerJoin: (...args: unknown[]) => mockJoin(...args),
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
      <EventsScreen />
    </QueryClientProvider>
  );
  const result = await render(tree());
  return { rerender: () => result.rerender(tree()) };
};
const openJoin = async () => userEvent.setup().press(screen.getByRole("button", { name: "Join Event" }));
const enterInvitation = async (value = "invite-token") =>
  userEvent.setup().type(screen.getByLabelText("Invitation URL or token"), value);

beforeEach(() => {
  mockUser = { id: "user-1" };
  mockFocused = true;
  mockColorScheme.mockReturnValue("light");
  mockCameraPermission.mockReturnValue({ granted: true });
  mockFindAll.mockReset().mockResolvedValue({ data: { data: [] } });
  mockJoin.mockReset().mockResolvedValue({ data: { data: buildEvent() } });
  mockPush.mockReset();
  jest.spyOn(Alert, "alert").mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

test.each(["light", "dark"])("loads and displays the empty Events page in %s mode", async (theme) => {
  mockColorScheme.mockReturnValue(theme);
  const pending = deferred<unknown>();
  mockFindAll.mockReturnValue(pending.promise);
  await renderScreen();
  expect(screen.getByLabelText("Loading events")).toBeOnTheScreen();
  expect(screen.queryByText("No events yet")).not.toBeOnTheScreen();
  pending.resolve({ data: { data: [] } });
  expect(await screen.findByText("No events yet")).toBeOnTheScreen();
  expect(screen.getByText("My Events")).toBeOnTheScreen();
});

test("navigates to create and event details from the rendered page", async () => {
  mockFindAll.mockResolvedValue({ data: { data: [buildEvent()] } });
  await renderScreen();
  await screen.findByText("Weekend meetup");
  const user = userEvent.setup();
  await user.press(screen.getByRole("button", { name: "Create Event" }));
  expect(mockPush).toHaveBeenLastCalledWith("/events/create");
  await user.press(screen.getByRole("button", { name: "Open Weekend meetup" }));
  expect(mockPush).toHaveBeenLastCalledWith("/events/event-1");
});

test("joins with a trimmed link, refreshes the list, closes and resets the form", async () => {
  mockJoin.mockImplementation(async () => {
    mockFindAll.mockResolvedValue({ data: { data: [buildEvent()] } });
    return { data: { data: buildEvent() } };
  });
  await renderScreen();
  await screen.findByText("No events yet");
  await openJoin();
  await enterInvitation("  https://events.everglow.app/invite/weekend  ");
  await userEvent.setup().press(screen.getByText("Join with Link"));
  expect(await screen.findByText("Weekend meetup")).toBeOnTheScreen();
  await waitFor(() => expect(screen.queryByText("Join an Event")).not.toBeOnTheScreen());
  expect(mockJoin).toHaveBeenCalledWith({ body: { invitationUrl: buildEvent().invitationUrl }, throwOnError: true });
  expect(Alert.alert).toHaveBeenCalledWith("Success", "You have successfully joined the event!");
  await openJoin();
  expect(screen.getByLabelText("Invitation URL or token")).toHaveDisplayValue("");
});

test("blocks invalid input without sending a request", async () => {
  await renderScreen();
  await openJoin();
  await userEvent.setup().press(screen.getByText("Join with Link"));
  expect(await screen.findByText("Please paste the invitation URL or invite token.")).toBeOnTheScreen();
  expect(mockJoin).not.toHaveBeenCalled();
});

test("preserves failed invitations and permits retry", async () => {
  mockJoin.mockRejectedValueOnce(new Error("Invitation expired"));
  await renderScreen();
  await openJoin();
  await enterInvitation();
  await userEvent.setup().press(screen.getByText("Join with Link"));
  await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith("Error", "Invitation expired"));
  expect(screen.getByLabelText("Invitation URL or token")).toHaveDisplayValue("invite-token");
  await userEvent.setup().press(screen.getByText("Join with Link"));
  await waitFor(() => expect(screen.queryByText("Join an Event")).not.toBeOnTheScreen());
  expect(mockJoin).toHaveBeenCalledTimes(2);
});

test("keeps the modal open and blocks duplicate submission and dismissal while pending", async () => {
  const pending = deferred<unknown>();
  mockJoin.mockReturnValue(pending.promise);
  await renderScreen();
  await openJoin();
  await enterInvitation();
  await userEvent.setup().press(screen.getByText("Join with Link"));
  expect(screen.getByText("Cancel")).toBeDisabled();
  expect(screen.getByLabelText("Invitation URL or token")).toHaveProp("editable", false);
  await fireEvent(screen.getByLabelText("Invitation URL or token"), "submitEditing");
  await fireEvent(screen.getByTestId("join-event-modal"), "requestClose");
  await userEvent.setup().press(screen.getByText("Scan QR Code"));
  expect(screen.getByText("Join an Event")).toBeOnTheScreen();
  expect(screen.queryByTestId("camera")).not.toBeOnTheScreen();
  expect(mockJoin).toHaveBeenCalledTimes(1);
  pending.resolve({ data: { data: buildEvent() } });
  await waitFor(() => expect(screen.queryByText("Join an Event")).not.toBeOnTheScreen());
});

test("reports an already joined event without duplicating the list", async () => {
  mockFindAll.mockResolvedValue({ data: { data: [buildEvent()] } });
  await renderScreen();
  await screen.findByText("Weekend meetup");
  await openJoin();
  await enterInvitation();
  await userEvent.setup().press(screen.getByText("Join with Link"));
  await waitFor(() =>
    expect(Alert.alert).toHaveBeenCalledWith("Already Joined", "You are already a member of this event."),
  );
  expect(screen.getAllByText("Weekend meetup")).toHaveLength(1);
});

test("joins via the real scanner and form workflow", async () => {
  mockJoin.mockImplementation(async () => {
    mockFindAll.mockResolvedValue({ data: { data: [buildEvent()] } });
    return { data: { data: buildEvent() } };
  });
  await renderScreen();
  await screen.findByText("No events yet");
  await openJoin();
  await userEvent.setup().press(screen.getByText("Scan QR Code"));
  await fireEvent(screen.getByTestId("camera"), "barcodeScanned", { data: "  scanned-token  " });
  expect(await screen.findByText("Weekend meetup")).toBeOnTheScreen();
  expect(mockJoin).toHaveBeenCalledWith({ body: { invitationUrl: "scanned-token" }, throwOnError: true });
  await waitFor(() => expect(screen.queryByText("Join an Event")).not.toBeOnTheScreen());
});

test("cancel clears input and validation before reopening", async () => {
  await renderScreen();
  await openJoin();
  await enterInvitation("   ");
  await userEvent.setup().press(screen.getByText("Join with Link"));
  await screen.findByText("Please paste the invitation URL or invite token.");
  await userEvent.setup().press(screen.getByText("Cancel"));
  expect(screen.queryByText("Join an Event")).not.toBeOnTheScreen();
  await openJoin();
  expect(screen.getByLabelText("Invitation URL or token")).toHaveDisplayValue("");
  expect(screen.queryByText("Please paste the invitation URL or invite token.")).not.toBeOnTheScreen();
});

test("opens the selected event invitation and closes it without navigation", async () => {
  const event = buildEvent();
  mockFindAll.mockResolvedValue({
    data: { data: [event, buildEvent({ id: "event-2", title: "Guest event", creatorId: "other" })] },
  });
  await renderScreen();
  await screen.findByText(event.title);
  expect(screen.queryByRole("button", { name: "Share Guest event" })).not.toBeOnTheScreen();
  await userEvent.setup().press(screen.getByRole("button", { name: `Share ${event.title}` }));
  expect(screen.getByText("Share Event")).toBeOnTheScreen();
  expect(screen.getByText(event.invitationUrl)).toBeOnTheScreen();
  expect(mockPush).not.toHaveBeenCalled();
  await userEvent.setup().press(screen.getByText("Close"));
  expect(screen.queryByText("Share Event")).not.toBeOnTheScreen();
});

test("pull-to-refresh retains current events until the refreshed list arrives", async () => {
  mockFindAll.mockResolvedValue({ data: { data: [buildEvent()] } });
  await renderScreen();
  await screen.findByText("Weekend meetup");
  const pending = deferred<unknown>();
  mockFindAll.mockReturnValue(pending.promise);
  // RefreshControl's native gesture has no userEvent equivalent.
  await fireEvent(screen.getByTestId("events-refresh"), "refresh");
  await waitFor(() => expect(screen.getByTestId("events-refresh")).toHaveProp("refreshing", true));
  expect(screen.getByText("Weekend meetup")).toBeOnTheScreen();
  pending.resolve({ data: { data: [buildEvent({ title: "Updated meetup" })] } });
  expect(await screen.findByText("Updated meetup")).toBeOnTheScreen();
  expect(screen.queryByText("Weekend meetup")).not.toBeOnTheScreen();
  await waitFor(() => expect(screen.getByTestId("events-refresh")).toHaveProp("refreshing", false));
});

test("reports initial fetch errors and recovers on refresh", async () => {
  mockFindAll.mockRejectedValue(new Error("Offline"));
  await renderScreen();
  await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith("Error", "Offline"));
  mockFindAll.mockResolvedValue({ data: { data: [buildEvent()] } });
  await fireEvent(screen.getByTestId("events-refresh"), "refresh");
  expect(await screen.findByText("Weekend meetup")).toBeOnTheScreen();
});

test("retains cached events after a refresh failure", async () => {
  mockFindAll.mockResolvedValue({ data: { data: [buildEvent()] } });
  await renderScreen();
  await screen.findByText("Weekend meetup");
  mockFindAll.mockRejectedValue(new Error("Refresh failed"));
  await fireEvent(screen.getByTestId("events-refresh"), "refresh");
  await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith("Error", "Refresh failed"));
  expect(screen.getByText("Weekend meetup")).toBeOnTheScreen();
  expect(screen.getByTestId("events-refresh")).toHaveProp("refreshing", false);
});

test("refreshes on returning to Events", async () => {
  mockFindAll.mockResolvedValue({ data: { data: [buildEvent()] } });
  const { rerender } = await renderScreen();
  await screen.findByText("Weekend meetup");
  mockFocused = false;
  await rerender();
  mockFindAll.mockResolvedValue({ data: { data: [buildEvent({ title: "Created on another page" })] } });
  mockFocused = true;
  await rerender();
  expect(await screen.findByText("Created on another page")).toBeOnTheScreen();
});

test("does not fetch or refresh without a signed-in user", async () => {
  mockUser = null;
  await renderScreen();
  expect(screen.getByText("No events yet")).toBeOnTheScreen();
  await fireEvent(screen.getByTestId("events-refresh"), "refresh");
  expect(mockFindAll).not.toHaveBeenCalled();
});

test("does not display the previous user's events after switching accounts", async () => {
  mockFindAll.mockResolvedValue({ data: { data: [buildEvent()] } });
  const { rerender } = await renderScreen();
  await screen.findByText("Weekend meetup");
  const pending = deferred<unknown>();
  mockFindAll.mockReturnValue(pending.promise);
  mockUser = { id: "user-2" };
  await rerender();
  expect(screen.queryByText("Weekend meetup")).not.toBeOnTheScreen();
  pending.resolve({
    data: { data: [buildEvent({ id: "other-event", title: "Other account event", creatorId: "user-2" })] },
  });
  expect(await screen.findByText("Other account event")).toBeOnTheScreen();
});

test("opens Account Settings from the Events header avatar", async () => {
  await renderScreen();
  expect(screen.getByRole("header", { name: "Everglow" })).toBeOnTheScreen();
  await userEvent.setup().press(screen.getByRole("button", { name: "Account Settings" }));
  expect(mockPush).toHaveBeenCalledWith("/account-settings");
});
