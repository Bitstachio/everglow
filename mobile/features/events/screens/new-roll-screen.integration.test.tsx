import "../testing/native-mocks";
// The integration harness supplies the real data provider.
// eslint-disable-next-line no-restricted-imports
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderWithI18n } from "@/testing/render";
import { act, screen, userEvent, waitFor } from "@testing-library/react-native";
// Observe the native alert boundary without replacing screen hooks.
// eslint-disable-next-line no-restricted-imports
import { Alert, Keyboard, type AlertButton } from "react-native";
import NewRollScreen from "./new-roll-screen";
// Seed the limits cache at the integration boundary.
import { profileKeys } from "@/features/profile/api/keys";
import { buildEvent, deferred } from "../testing/fixtures";

const mockCreate = jest.fn();
const mockLimits = jest.fn();
const mockReplace = jest.fn();
const mockBack = jest.fn();

jest.mock("@/lib/api/generated/client.gen", () => ({ client: { getConfig: () => ({}) } }));
const mockMintCover = jest.fn();
const mockConfirmCover = jest.fn();
jest.mock("@/lib/api/generated", () => ({
  eventsControllerCreate: (...args: unknown[]) => mockCreate(...args),
  eventsControllerCreateCoverUploadUrl: (...args: unknown[]) => mockMintCover(...args),
  eventsControllerConfirmCoverUpload: (...args: unknown[]) => mockConfirmCover(...args),
  usersControllerGetMyLimits: (...args: unknown[]) => mockLimits(...args),
}));
// Native boundaries: the photo picker, the on-device crop and the byte upload.
jest.mock("expo-image-picker", () => ({
  requestMediaLibraryPermissionsAsync: () => Promise.resolve({ granted: true }),
  launchImageLibraryAsync: () =>
    Promise.resolve({ canceled: false, assets: [{ uri: "file://picked.heic", width: 4032, height: 3024 }] }),
}));
jest.mock("../lib/cover-image", () => ({
  COVER_ASPECT: [16, 9],
  prepareCoverImage: () => Promise.resolve({ uri: "file://cover.jpg", contentType: "image/jpeg" }),
}));
jest.mock("@/lib/api/upload-file", () => ({
  uploadFile: async ({ contentType, mint }: { contentType: string; mint: (file: unknown) => Promise<unknown> }) => {
    await mint({ contentType, sizeBytes: 2048 });
    return { uploadId: "upload-1" };
  },
}));
jest.mock("expo-router", () => ({ useRouter: () => ({ replace: mockReplace, back: mockBack }) }));
jest.mock("@/hooks/use-reduce-motion", () => ({ useReduceMotion: () => true }));

// Sunday 1 November 2026, 09:41 on the device's clock.
const NOW = new Date(2026, 10, 1, 9, 41);

const limits = (newEvent: Record<string, unknown> = {}) => ({
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
        ...newEvent,
      },
    },
  },
});

// Captured so a test can raise and lower the keyboard.
const keyboard: Record<string, () => void> = {};

const renderScreen = async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: 0 } },
  });
  await renderWithI18n(
    <QueryClientProvider client={client}>
      <NewRollScreen />
    </QueryClientProvider>,
  );
  await screen.findByText("Choose your film · how long people can add photos");
};

beforeEach(() => {
  // Only the clock is fake; React Query and userEvent keep real timers.
  jest.useFakeTimers({
    now: NOW,
    doNotFake: [
      "hrtime",
      "nextTick",
      "performance",
      "queueMicrotask",
      "requestAnimationFrame",
      "cancelAnimationFrame",
      "requestIdleCallback",
      "cancelIdleCallback",
      "setImmediate",
      "clearImmediate",
      "setInterval",
      "clearInterval",
      "setTimeout",
      "clearTimeout",
    ],
  });
  mockCreate.mockReset().mockResolvedValue({ data: { data: buildEvent({ id: "roll-1" }) } });
  mockLimits.mockReset().mockResolvedValue(limits());
  mockReplace.mockReset();
  mockBack.mockReset();
  mockMintCover.mockReset().mockResolvedValue({
    data: { data: { uploadId: "upload-1", uploadUrl: "https://upload.example.com/1", expiresAt: "2030-01-01" } },
  });
  mockConfirmCover.mockReset().mockResolvedValue({ data: { data: buildEvent({ id: "roll-1" }) } });
  jest.spyOn(Alert, "alert").mockImplementation(() => {});
  jest.spyOn(Keyboard, "addListener").mockImplementation((event, listener) => {
    keyboard[event] = listener as () => void;
    return { remove: jest.fn() } as unknown as ReturnType<typeof Keyboard.addListener>;
  });
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

test("labels a new roll for tonight with the plan's default film", async () => {
  await renderScreen();

  expect(screen.getByText("Everglow 400")).toBeOnTheScreen();
  expect(screen.getByText("Tonight · 20:00 · edit ›")).toBeOnTheScreen();
  expect(screen.getAllByRole("radio").map((box) => box.props.accessibilityLabel)).toEqual([
    "Weekend, 3-day roll",
    "A week, 7-day roll",
    "Two weeks, 14-day roll",
    "A month, 30-day roll",
  ]);
  expect(screen.getByRole("radio", { name: "A month, 30-day roll" })).toBeChecked();
  expect(screen.getByText(/Develops Sun 01.11 · photos removed Tue 01.12/)).toBeOnTheScreen();
  expect(screen.getByRole("button", { name: "Load the roll" })).toBeDisabled();
});

test("names the roll, sets when it happens and the film, then opens it", async () => {
  await renderScreen();
  const user = userEvent.setup();

  await user.paste(screen.getByLabelText("Roll name"), "Nadia turns 30");
  await user.press(screen.getByRole("radio", { name: "A week, 7-day roll" }));
  expect(screen.getByRole("radio", { name: "A week, 7-day roll" })).toBeChecked();

  await user.press(screen.getByRole("button", { name: /^When it happens: Tonight · 20:00/ }));
  expect(screen.getByText("November 2026")).toBeOnTheScreen();
  await user.press(screen.getByRole("button", { name: "Sat 7 Nov" }));
  await user.press(screen.getByRole("button", { name: "19:00" }));
  // While the slip is open, the label follows the draft.
  expect(screen.getByText("Sat 07.11 · 19:00")).toBeOnTheScreen();
  await user.press(screen.getByRole("button", { name: "Set Sat 7 Nov, 19:00" }));

  expect(await screen.findByText("Sat 07.11 · 19:00 · edit ›")).toBeOnTheScreen();
  expect(screen.getByText(/Develops Sat 07.11 · photos removed Sat 14.11/)).toBeOnTheScreen();

  await user.press(screen.getByRole("button", { name: "Load the roll" }));
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/events/roll-1/loaded"));
  expect(mockCreate).toHaveBeenCalledWith({
    body: { title: "Nadia turns 30", date: new Date(2026, 10, 7, 19).toISOString(), galleryWindowDays: 7 },
    throwOnError: true,
  });
  // The new roll counts toward the account's active rolls, so the limits load again.
  await waitFor(() => expect(mockLimits).toHaveBeenCalledTimes(2));
});

/** Opens the first frame's menu and chooses from the library. */
const chooseCover = async () => {
  const alert = jest.mocked(Alert.alert);
  alert.mockClear();
  await userEvent.setup().press(screen.getByRole("button", { name: "Add a cover" }));
  const buttons = (alert.mock.calls[0]?.[2] ?? []) as AlertButton[];
  await act(async () => {
    buttons.find((button) => button.text === "Choose from Photos")?.onPress?.();
  });
};

test("adds a first frame and uploads it once the roll is loaded", async () => {
  await renderScreen();
  expect(screen.getByText("Add one ›")).toBeOnTheScreen();

  await chooseCover();
  expect(await screen.findByText("Change ›")).toBeOnTheScreen();

  const user = userEvent.setup();
  await user.paste(screen.getByLabelText("Roll name"), "Nadia turns 30");
  await user.press(screen.getByRole("button", { name: "Load the roll" }));

  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/events/roll-1/loaded"));
  expect(mockMintCover).toHaveBeenCalledWith(
    expect.objectContaining({ path: { eventId: "roll-1" }, body: { contentType: "image/jpeg", sizeBytes: 2048 } }),
  );
  expect(mockConfirmCover).toHaveBeenCalledWith(
    expect.objectContaining({ path: { eventId: "roll-1" }, body: { uploadId: "upload-1" } }),
  );
  expect(Alert.alert).not.toHaveBeenCalledWith("The cover didn’t take", expect.any(String));
});

test("loads the roll even when its first frame didn't take", async () => {
  mockConfirmCover.mockRejectedValue(new Error("Network unavailable"));
  await renderScreen();
  await chooseCover();
  await screen.findByText("Change ›");

  const user = userEvent.setup();
  await user.paste(screen.getByLabelText("Roll name"), "Nadia turns 30");
  await user.press(screen.getByRole("button", { name: "Load the roll" }));

  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/events/roll-1/loaded"));
  expect(Alert.alert).toHaveBeenCalledWith(
    "The cover didn’t take",
    "The roll is loaded. Add the cover from the roll’s settings.",
  );
  expect(screen.queryByText("The roll didn’t load. Try again.")).not.toBeOnTheScreen();
});

test("shows the line for guests while typing and sends it", async () => {
  await renderScreen();
  expect(screen.queryByLabelText("A line for guests, optional")).not.toBeOnTheScreen();

  await act(() => keyboard.keyboardDidShow());
  const user = userEvent.setup();
  await user.paste(screen.getByLabelText("Roll name"), "Nadia turns 30");
  await user.paste(screen.getByLabelText("A line for guests, optional"), "Bring a jacket, we’re on the roof");
  await act(() => keyboard.keyboardDidHide());
  // Written in, it stays on the screen.
  expect(screen.getByLabelText("A line for guests, optional")).toBeOnTheScreen();

  await user.press(screen.getByRole("button", { name: "Load the roll" }));
  await waitFor(() =>
    expect(mockCreate).toHaveBeenCalledWith({
      body: expect.objectContaining({ description: "Bring a jacket, we’re on the roof" }),
      throwOnError: true,
    }),
  );
});

test("offers only the days the API allows", async () => {
  mockLimits.mockResolvedValue(limits({ latestDate: new Date(2026, 10, 20, 9, 41).toISOString() }));
  await renderScreen();
  const user = userEvent.setup();

  await user.press(screen.getByRole("button", { name: /^When it happens/ }));
  expect(screen.getByRole("button", { name: "Sat 21 Nov, can’t be picked" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Fri 20 Nov" })).toBeEnabled();
  expect(screen.getByRole("button", { name: "Previous month" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Next month" })).toBeDisabled();
});

test("chooses the plan's default film when the limits are already loaded", async () => {
  mockLimits.mockResolvedValue(limits({ defaultGalleryWindowDays: 7 }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(profileKeys.limits(), limits({ defaultGalleryWindowDays: 7 }).data.data);
  await renderWithI18n(
    <QueryClientProvider client={client}>
      <NewRollScreen />
    </QueryClientProvider>,
  );

  expect(screen.getByRole("radio", { name: "A week, 7-day roll" })).toBeChecked();
  const user = userEvent.setup();
  await user.paste(screen.getByLabelText("Roll name"), "Nadia turns 30");
  await user.press(screen.getByRole("button", { name: "Load the roll" }));
  await waitFor(() =>
    expect(mockCreate).toHaveBeenCalledWith({
      body: expect.objectContaining({ galleryWindowDays: 7 }),
      throwOnError: true,
    }),
  );
});

test("prints any other length the API offers in days", async () => {
  mockLimits.mockResolvedValue(limits({ galleryWindowOptions: [3, 90], defaultGalleryWindowDays: 90 }));
  await renderScreen();

  expect(screen.getByRole("radio", { name: "90 days, 90-day roll" })).toBeChecked();
});

test("keeps the roll and says so when it didn't load", async () => {
  const pending = deferred<unknown>();
  mockCreate.mockReturnValueOnce(pending.promise);
  await renderScreen();
  const user = userEvent.setup();
  await user.paste(screen.getByLabelText("Roll name"), "Nadia turns 30");
  await user.press(screen.getByRole("button", { name: "Load the roll" }));

  expect(screen.getByLabelText("Roll name")).toHaveProp("editable", false);
  pending.reject(new Error("Network unavailable"));

  expect(await screen.findByText("The roll didn’t load. Try again.")).toBeOnTheScreen();
  expect(screen.getByLabelText("Roll name")).toHaveDisplayValue("Nadia turns 30");
  expect(mockReplace).not.toHaveBeenCalled();
});

test("waits for the film, and offers to try again if it can't be had", async () => {
  const first = deferred<unknown>();
  mockLimits.mockReturnValueOnce(first.promise);
  await renderWithI18n(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <NewRollScreen />
    </QueryClientProvider>,
  );
  expect(screen.getByTestId("new-roll-loading")).toBeOnTheScreen();
  first.reject(new Error("Network unavailable"));

  expect(
    await screen.findByText("Couldn’t get the film ready. Check your connection and try again."),
  ).toBeOnTheScreen();
  await userEvent.setup().press(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByText("Tonight · 20:00 · edit ›")).toBeOnTheScreen();
});

test("closes back to Home", async () => {
  await renderScreen();
  await userEvent.setup().press(screen.getByRole("button", { name: "Close" }));
  expect(mockBack).toHaveBeenCalledTimes(1);
});
