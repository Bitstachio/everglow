import { render, screen, userEvent } from "@testing-library/react-native";
import { Alert, Button, Clipboard, Share, Text, View } from "react-native";
import type { EventResponseDto } from "../types";
import { buildEvent } from "../testing/fixtures";
import { useCreateEventScreen } from "./use-create-event-screen";

const mockBack = jest.fn();
let mockSuccess: (event: EventResponseDto) => void;
jest.mock("expo-router", () => ({ useRouter: () => ({ back: mockBack }) }));
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
      <Button title="Copy" onPress={state.handleCopyLink} />
      <Button title="Share" onPress={state.handleShareLink} />
      <Button title="Another" onPress={state.handleCreateAnother} />
      <Button title="Done" onPress={state.handleDone} />
    </View>
  );
};
beforeEach(() => {
  mockBack.mockReset();
  jest.spyOn(Alert, "alert").mockImplementation(() => {});
  jest.spyOn(Clipboard, "setString").mockImplementation(() => {});
  jest.spyOn(Share, "share").mockResolvedValue({ action: Share.sharedAction });
});
afterEach(() => jest.restoreAllMocks());

test("ignores copy and share before creation", async () => {
  await render(<ScreenProbe />);
  const user = userEvent.setup();
  await user.press(screen.getByRole("button", { name: "Copy" }));
  await user.press(screen.getByRole("button", { name: "Share" }));
  expect(Clipboard.setString).not.toHaveBeenCalled();
  expect(Share.share).not.toHaveBeenCalled();
  expect(Alert.alert).not.toHaveBeenCalled();
});

test("stores the result and clears it when creating another event", async () => {
  await render(<ScreenProbe />);
  const user = userEvent.setup();
  await user.press(screen.getByRole("button", { name: "Complete creation" }));
  expect(screen.getByText(buildEvent().title)).toBeOnTheScreen();
  await user.press(screen.getByRole("button", { name: "Another" }));
  expect(screen.getByText("No created event")).toBeOnTheScreen();
  await user.press(screen.getByRole("button", { name: "Copy" }));
  await user.press(screen.getByRole("button", { name: "Share" }));
  expect(Clipboard.setString).not.toHaveBeenCalled();
  expect(Share.share).not.toHaveBeenCalled();
});

test("Done goes back once", async () => {
  await render(<ScreenProbe />);
  await userEvent.setup().press(screen.getByRole("button", { name: "Done" }));
  expect(mockBack).toHaveBeenCalledTimes(1);
});
