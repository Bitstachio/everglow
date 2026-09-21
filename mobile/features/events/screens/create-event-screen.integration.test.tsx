import { mockColorScheme } from "../testing/native-mocks";
import "../testing/date-picker-mock";
// The integration harness supplies the real data provider and observes native services.
// eslint-disable-next-line no-restricted-imports
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, userEvent, waitFor } from "@testing-library/react-native";
// eslint-disable-next-line no-restricted-imports
import { Alert, Clipboard, Platform, Share } from "react-native";
import CreateEventScreen from "./create-event-screen";
import { buildEvent, deferred } from "../testing/fixtures";
// Seed and inspect caches at the integration boundary.
// eslint-disable-next-line no-restricted-imports
import { eventsKeys } from "../api/keys";

const mockCreate = jest.fn();
const mockBack = jest.fn();
jest.mock("@/lib/api/generated/client.gen", () => ({ client: { getConfig: () => ({}) } }));
jest.mock("@/lib/api/generated", () => ({ eventsControllerCreate: (...args: unknown[]) => mockCreate(...args) }));
jest.mock("expo-router", () => ({ useRouter: () => ({ back: mockBack }) }));
const clients: QueryClient[] = [];
const originalOS = Platform.OS;
const renderScreen = async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: 0 } },
  });
  clients.push(client);
  client.setQueryData(eventsKeys.list("user-1"), []);
  client.setQueryData(eventsKeys.list("user-2"), []);
  client.setQueryData(["profile"], { name: "Ada" });
  await render(
    <QueryClientProvider client={client}>
      <CreateEventScreen />
    </QueryClientProvider>,
  );
  return client;
};
const submit = async (title = "Meetup") => {
  const user = userEvent.setup();
  await user.type(screen.getByPlaceholderText("Enter event name"), title);
  await user.press(screen.getByText("Create Event"));
};

beforeEach(() => {
  mockColorScheme.mockReturnValue("light");
  mockCreate.mockReset().mockResolvedValue({ data: { data: buildEvent() } });
  mockBack.mockReset();
  jest.spyOn(Clipboard, "setString").mockImplementation(() => {});
  jest.spyOn(Alert, "alert").mockImplementation(() => {});
  jest.spyOn(Share, "share").mockResolvedValue({ action: Share.sharedAction });
});
afterEach(() => {
  Platform.OS = originalOS;
  jest.restoreAllMocks();
  clients.splice(0).forEach((client) => client.clear());
});

test.each(["ios", "android"] as const)(
  "creates an event with selected date/time on %s and invalidates event caches",
  async (os) => {
    Platform.OS = os;
    const client = await renderScreen();
    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText("Enter event name"), "  Meetup  ");
    await user.type(screen.getByPlaceholderText("What's this event about?"), "  Bring friends  ");
    await user.press(screen.getByRole("button", { name: "Choose date" }));
    const initial = screen.getByTestId("date-picker").props.value as Date;
    await fireEvent(screen.getByTestId("date-picker"), "change", { type: "set" }, new Date(2031, 1, 10));
    await user.press(screen.getByRole("button", { name: "Choose time" }));
    await fireEvent(screen.getByTestId("time-picker"), "change", { type: "set" }, new Date(2030, 0, 1, 9, 45));
    await user.press(screen.getByText("Create Event"));
    expect(await screen.findByText("Event Created Successfully!")).toBeOnTheScreen();
    const expectedDate = new Date(initial);
    expectedDate.setFullYear(2031, 1, 10);
    expectedDate.setHours(9, 45);
    expect(mockCreate).toHaveBeenCalledWith({
      body: { title: "Meetup", description: "Bring friends", date: expectedDate.toISOString() },
      throwOnError: true,
    });
    expect(screen.getByText(buildEvent().title)).toBeOnTheScreen();
    expect(screen.getByLabelText(`QR code: ${buildEvent().invitationUrl}`)).toBeOnTheScreen();
    expect(client.getQueryState(eventsKeys.list("user-1"))?.isInvalidated).toBe(true);
    expect(client.getQueryState(eventsKeys.list("user-2"))?.isInvalidated).toBe(true);
    expect(client.getQueryState(["profile"])?.isInvalidated).toBe(false);
  },
);

test.each(["light", "dark"])(
  "validates required fields then accepts an optional description in %s mode",
  async (theme) => {
    mockColorScheme.mockReturnValue(theme);
    await renderScreen();
    await userEvent.setup().press(screen.getByText("Create Event"));
    expect(await screen.findByText("Event title is required.")).toBeOnTheScreen();
    expect(mockCreate).not.toHaveBeenCalled();
    await submit();
    expect(await screen.findByText("Event Created Successfully!")).toBeOnTheScreen();
    expect(mockCreate).toHaveBeenCalledWith({
      body: { title: "Meetup", date: expect.any(String) },
      throwOnError: true,
    });
  },
);

test("displays date validation from the real form", async () => {
  await renderScreen();
  await userEvent.setup().press(screen.getByRole("button", { name: "Choose date" }));
  await fireEvent(screen.getByTestId("date-picker"), "change", { type: "set" }, new Date(NaN));
  await submit();
  expect(await screen.findByText("Choose a valid event date and time.")).toBeOnTheScreen();
  expect(mockCreate).not.toHaveBeenCalled();
});

test("keeps entered values after failure, preserves caches, and permits retry", async () => {
  mockCreate.mockRejectedValueOnce(new Error("Network unavailable"));
  const client = await renderScreen();
  await userEvent.setup().type(screen.getByPlaceholderText("What's this event about?"), "Bring friends");
  await submit();
  expect(await screen.findByText("Network unavailable")).toBeOnTheScreen();
  expect(screen.getByPlaceholderText("Enter event name")).toHaveDisplayValue("Meetup");
  expect(screen.getByPlaceholderText("What's this event about?")).toHaveDisplayValue("Bring friends");
  expect(client.getQueryState(eventsKeys.list("user-1"))?.isInvalidated).toBe(false);
  await userEvent.setup().press(screen.getByText("Create Event"));
  expect(await screen.findByText("Event Created Successfully!")).toBeOnTheScreen();
  expect(mockCreate).toHaveBeenCalledTimes(2);
  expect(screen.queryByText("Network unavailable")).not.toBeOnTheScreen();
});

test("locks editing and picker controls until creation completes", async () => {
  const pending = deferred<unknown>();
  mockCreate.mockReturnValue(pending.promise);
  await renderScreen();
  await submit();
  expect(screen.getByPlaceholderText("Enter event name")).toHaveProp("editable", false);
  expect(screen.getByPlaceholderText("What's this event about?")).toHaveProp("editable", false);
  expect(screen.queryByText("Create Event")).not.toBeOnTheScreen();
  for (const mode of ["date", "time"]) {
    const button = screen.getByRole("button", { name: `Choose ${mode}` });
    expect(button).toBeDisabled();
    await userEvent.setup().press(button);
    expect(screen.queryByTestId(`${mode}-picker`)).not.toBeOnTheScreen();
  }
  expect(mockCreate).toHaveBeenCalledTimes(1);
  pending.resolve({ data: { data: buildEvent() } });
  expect(await screen.findByText("Event Created Successfully!")).toBeOnTheScreen();
});

test("copies and shares the server-returned invitation and Done returns to the previous page", async () => {
  await renderScreen();
  await submit();
  await screen.findByText("Event Created Successfully!");
  const user = userEvent.setup();
  await user.press(screen.getByText(buildEvent().invitationUrl));
  expect(Clipboard.setString).toHaveBeenCalledWith(buildEvent().invitationUrl);
  expect(Alert.alert).toHaveBeenCalledWith("Copied!", "Invitation link copied to clipboard");
  await user.press(screen.getByText("Share Link"));
  expect(Share.share).toHaveBeenCalledWith({
    message: `Join "${buildEvent().title}" via ${buildEvent().invitationUrl}`,
  });
  expect(mockBack).not.toHaveBeenCalled();
  await user.press(screen.getByText("Done"));
  expect(mockBack).toHaveBeenCalledTimes(1);
});

test.each([new Error("Share unavailable"), "unknown failure"])(
  "reports share failures while retaining the created event (%s)",
  async (error) => {
    jest.mocked(Share.share).mockRejectedValue(error);
    await renderScreen();
    await submit();
    await screen.findByText("Event Created Successfully!");
    await userEvent.setup().press(screen.getByText("Share Link"));
    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith(
        "Error",
        error instanceof Error ? error.message : "Failed to share invitation",
      ),
    );
    expect(screen.getByText("Event Created Successfully!")).toBeOnTheScreen();
    expect(mockBack).not.toHaveBeenCalled();
  },
);

test("dismisses native sharing without treating it as an error", async () => {
  jest.mocked(Share.share).mockResolvedValue({ action: Share.dismissedAction });
  await renderScreen();
  await submit();
  await screen.findByText("Event Created Successfully!");
  await userEvent.setup().press(screen.getByText("Share Link"));
  expect(Alert.alert).not.toHaveBeenCalled();
  expect(screen.getByText("Event Created Successfully!")).toBeOnTheScreen();
});

test("Create Another resets the form and replaces the invitation after the next creation", async () => {
  await renderScreen();
  await submit();
  await screen.findByText("Event Created Successfully!");
  const user = userEvent.setup();
  await user.press(screen.getByText("Create Another Event"));
  expect(screen.getByPlaceholderText("Enter event name")).toHaveDisplayValue("");
  expect(screen.getByPlaceholderText("What's this event about?")).toHaveDisplayValue("");
  expect(screen.queryByText(buildEvent().invitationUrl)).not.toBeOnTheScreen();
  const next = buildEvent({
    id: "second",
    title: "Picnic",
    description: null,
    invitationUrl: "https://events.everglow.app/invite/picnic",
  });
  mockCreate.mockResolvedValue({ data: { data: next } });
  await submit("Picnic");
  expect(await screen.findByText("Event Created Successfully!")).toBeOnTheScreen();
  await user.press(screen.getByText(next.invitationUrl));
  expect(Clipboard.setString).toHaveBeenLastCalledWith(next.invitationUrl);
  expect(screen.getByText("Picnic")).toBeOnTheScreen();
  expect(mockCreate).toHaveBeenCalledTimes(2);
});
