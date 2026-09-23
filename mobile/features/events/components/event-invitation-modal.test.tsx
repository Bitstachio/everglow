import { mockColorScheme } from "../testing/native-mocks";
import { render, screen, userEvent, waitFor } from "@testing-library/react-native";
import { Alert, Clipboard, Share } from "react-native";
import { buildEvent } from "../testing/fixtures";
import { EventInvitationModal } from "./event-invitation-modal";

beforeEach(() => {
  mockColorScheme.mockReturnValue("light");
  jest.spyOn(Alert, "alert").mockImplementation(() => {});
  jest.spyOn(Clipboard, "setString").mockImplementation(() => {});
  jest.spyOn(Share, "share").mockResolvedValue({ action: Share.sharedAction });
});
afterEach(() => jest.restoreAllMocks());

test.each(["light", "dark"])("shows event details and invitation in %s mode", async (theme) => {
  mockColorScheme.mockReturnValue(theme);
  const event = buildEvent();
  await render(<EventInvitationModal visible event={event} onClose={jest.fn()} />);
  expect(screen.getByText(event.title)).toBeOnTheScreen();
  expect(screen.getByText(event.description!)).toBeOnTheScreen();
  expect(screen.getByText(event.invitationUrl)).toBeOnTheScreen();
  expect(screen.getByLabelText(`QR code: ${event.invitationUrl}`)).toBeOnTheScreen();
});

test("renders nothing without an event or when hidden", async () => {
  const { rerender } = await render(<EventInvitationModal visible event={null} onClose={jest.fn()} />);
  expect(screen.queryByText("Share Event")).not.toBeOnTheScreen();
  await rerender(<EventInvitationModal visible={false} event={buildEvent()} onClose={jest.fn()} />);
  expect(screen.queryByText("Share Event")).not.toBeOnTheScreen();
});

test("supports events without a description", async () => {
  await render(<EventInvitationModal visible event={buildEvent({ description: null })} onClose={jest.fn()} />);
  expect(screen.getByText("Weekend meetup")).toBeOnTheScreen();
  expect(screen.queryByText("An afternoon with friends")).not.toBeOnTheScreen();
});

test("copies the invitation and confirms it", async () => {
  const event = buildEvent();
  await render(<EventInvitationModal visible event={event} onClose={jest.fn()} />);
  await userEvent.setup().press(screen.getByText(event.invitationUrl));
  expect(Clipboard.setString).toHaveBeenCalledWith(event.invitationUrl);
  expect(Alert.alert).toHaveBeenCalledWith("Copied!", "Invitation link copied to clipboard");
});

test("opens the native share sheet with the title and link", async () => {
  const event = buildEvent();
  await render(<EventInvitationModal visible event={event} onClose={jest.fn()} />);
  await userEvent.setup().press(screen.getByText("Share Link"));
  expect(Share.share).toHaveBeenCalledWith({ message: `Join "${event.title}" via ${event.invitationUrl}` });
});

test("handles share-sheet failure without closing", async () => {
  const error = new Error("Share unavailable");
  jest.mocked(Share.share).mockRejectedValue(error);
  const log = jest.spyOn(console, "error").mockImplementation(() => {});
  const onClose = jest.fn();
  await render(<EventInvitationModal visible event={buildEvent()} onClose={onClose} />);
  await userEvent.setup().press(screen.getByText("Share Link"));
  await waitFor(() => expect(log).toHaveBeenCalledWith("Share failed:", error));
  expect(onClose).not.toHaveBeenCalled();
  expect(screen.getByText("Share Event")).toBeOnTheScreen();
});

test.each(["Close", "Close invitation"])("closes using %s", async (label) => {
  const onClose = jest.fn();
  await render(<EventInvitationModal visible event={buildEvent()} onClose={onClose} />);
  await userEvent
    .setup()
    .press(label === "Close" ? screen.getByText(label) : screen.getByRole("button", { name: label }));
  expect(onClose).toHaveBeenCalledTimes(1);
});
