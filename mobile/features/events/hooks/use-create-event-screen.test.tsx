import { render, screen, userEvent } from "@testing-library/react-native";
import { Alert, Button, Clipboard, Share, Text, View } from "react-native";
import type { AccessLevel, EventResponseDto } from "../types";
import { buildEvent } from "../testing/fixtures";
import { useCreateEventScreen } from "./use-create-event-screen";

const mockBack = jest.fn();
const mockReplace = jest.fn();
let mockSuccess: (event: EventResponseDto) => void;
jest.mock("expo-router", () => ({ useRouter: () => ({ back: mockBack, replace: mockReplace }) }));
jest.mock("./use-create-event-form", () => ({
  useCreateEventForm: ({ onSuccess }: { onSuccess: (event: EventResponseDto) => void }) => {
    mockSuccess = onSuccess;
    return { form: {}, onSubmit: jest.fn() };
  },
}));
const ScreenProbe = () => {
  const state = useCreateEventScreen();
  return (
    <View>
      <Text>{state.createdEvent?.title ?? "No created event"}</Text>
      <Button title="Complete creation" onPress={() => mockSuccess(buildEvent())} />
      <Button title="Copy" onPress={() => state.handleCopyLink(buildEvent().invitationUrl)} />
      <Button
        title="Share"
        onPress={() => state.handleShareLink(buildEvent().invitationUrl, "PARTICIPANT" as AccessLevel)}
      />
      <Button title="Go to event" onPress={state.handleGoToEvent} />
      <Button title="Done" onPress={state.handleShareLater} />
    </View>
  );
};
beforeEach(() => {
  mockBack.mockReset();
  mockReplace.mockReset();
  jest.spyOn(Alert, "alert").mockImplementation(() => {});
  jest.spyOn(Clipboard, "setString").mockImplementation(() => {});
  jest.spyOn(Share, "share").mockResolvedValue({ action: Share.sharedAction });
});
afterEach(() => jest.restoreAllMocks());

test("ignores share before creation", async () => {
  await render(<ScreenProbe />);
  const user = userEvent.setup();
  await user.press(screen.getByRole("button", { name: "Share" }));
  expect(Share.share).not.toHaveBeenCalled();
  expect(Alert.alert).not.toHaveBeenCalled();
});

test("copies and shares the provided invite URL after creation", async () => {
  await render(<ScreenProbe />);
  const user = userEvent.setup();
  await user.press(screen.getByRole("button", { name: "Complete creation" }));
  expect(screen.getByText(buildEvent().title)).toBeOnTheScreen();
  await user.press(screen.getByRole("button", { name: "Copy" }));
  await user.press(screen.getByRole("button", { name: "Share" }));
  expect(Clipboard.setString).toHaveBeenCalledWith(buildEvent().invitationUrl);
  expect(Share.share).toHaveBeenCalledWith({
    message: `Join "${buildEvent().title}" as Participant via ${buildEvent().invitationUrl}`,
  });
});

test("Go to event replaces to the event detail route", async () => {
  await render(<ScreenProbe />);
  const user = userEvent.setup();
  await user.press(screen.getByRole("button", { name: "Complete creation" }));
  await user.press(screen.getByRole("button", { name: "Go to event" }));
  expect(mockReplace).toHaveBeenCalledWith(`/events/${buildEvent().id}`);
});

test("Done goes back once", async () => {
  await render(<ScreenProbe />);
  await userEvent.setup().press(screen.getByRole("button", { name: "Done" }));
  expect(mockBack).toHaveBeenCalledTimes(1);
});
