import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import { renderWithI18n } from "@/testing/render";
import { requestNotificationPermission } from "../lib/notification-permission";
import { NOTES_OFFER_AGAIN_AFTER_MS } from "../lib/notes-offer";
import { readPushPermission } from "../lib/push";
import { NotesAsk } from "./notes-ask";

/** The app's documents folder: gone with the app, unlike the Keychain. */
const mockFiles = new Map<string, string>();

jest.mock("expo-file-system", () => ({
  Paths: { document: "file://documents" },
  File: jest.fn().mockImplementation((directory: string, name: string) => {
    const uri = `${directory}/${name}`;
    return {
      exists: mockFiles.has(uri),
      textSync: () => mockFiles.get(uri),
      write: (text: string) => mockFiles.set(uri, text),
    };
  }),
}));
// The sheet's own animation is tested with it; here only what it holds matters.
jest.mock("@/components/ui/bottom-sheet/bottom-sheet", () => ({
  BottomSheet: ({ visible, children }: { visible: boolean; children: React.ReactNode }) => (visible ? children : null),
}));
jest.mock("../lib/push", () => ({ readPushPermission: jest.fn() }));
jest.mock("../lib/notification-permission", () => ({ requestNotificationPermission: jest.fn() }));

const readPermission = jest.mocked(readPushPermission);
const requestPermission = jest.mocked(requestNotificationPermission);
const NOT_NOW = "file://documents/notes-not-now.json";
const EDGE = "You’re on the roll · 25th";

beforeEach(() => {
  mockFiles.clear();
  jest.clearAllMocks();
  readPermission.mockResolvedValue("undetermined");
  requestPermission.mockResolvedValue(true);
});

const renderAsk = (props: Partial<React.ComponentProps<typeof NotesAsk>> = {}) =>
  renderWithI18n(<NotesAsk justJoined edge={EDGE} {...props} />);

const question = () => screen.queryByText("Want a note when photos land?");

/** Let the permission check settle before looking for nothing. */
const settle = async () => {
  await waitFor(() => expect(readPermission.mock.results.every((result) => result.type === "return")).toBe(true));
  await Promise.resolve();
};

describe("NotesAsk (06.6)", () => {
  it("asks once someone has just joined, with the arrival note on its edge", async () => {
    const onVisibleChange = jest.fn();
    await renderAsk({ onVisibleChange });

    await waitFor(() => expect(question()).toBeTruthy());
    expect(screen.getByText(EDGE)).toBeTruthy();
    expect(screen.getByText("A note when the gallery opens, and the day before photos are removed.")).toBeTruthy();
    expect(onVisibleChange).toHaveBeenLastCalledWith(true);
  });

  it("keeps its edge once the roll's arrival note has gone", async () => {
    const { rerender } = await renderAsk();
    await waitFor(() => expect(question()).toBeTruthy());

    await rerender(<NotesAsk justJoined={false} edge={null} />);

    expect(question()).toBeTruthy();
    expect(screen.getByText(EDGE)).toBeTruthy();
  });

  it("turns notes on with the system prompt, and closes", async () => {
    const onVisibleChange = jest.fn();
    await renderAsk({ onVisibleChange });
    await waitFor(() => expect(question()).toBeTruthy());

    await fireEvent.press(screen.getByText("Turn on notes"));

    expect(requestPermission).toHaveBeenCalled();
    await waitFor(() => expect(question()).toBeNull());
    expect(onVisibleChange).toHaveBeenLastCalledWith(false);
    expect(mockFiles.has(NOT_NOW)).toBe(false);
  });

  it("closes when the system prompt can't be shown", async () => {
    requestPermission.mockRejectedValue(new Error("unavailable"));
    await renderAsk();
    await waitFor(() => expect(question()).toBeTruthy());

    await fireEvent.press(screen.getByText("Turn on notes"));

    await waitFor(() => expect(question()).toBeNull());
  });

  it("Not now closes it without the system prompt, and remembers when", async () => {
    await renderAsk();
    await waitFor(() => expect(question()).toBeTruthy());

    await fireEvent.press(screen.getByText("Not now"));

    expect(requestPermission).not.toHaveBeenCalled();
    expect(question()).toBeNull();
    expect(JSON.parse(mockFiles.get(NOT_NOW) ?? "{}").at).toEqual(expect.any(String));
  });

  it("doesn't ask on a join within 30 days of Not now", async () => {
    mockFiles.set(
      NOT_NOW,
      JSON.stringify({ at: new Date(Date.now() - NOTES_OFFER_AGAIN_AFTER_MS + 60_000).toISOString() }),
    );

    await renderAsk();

    await Promise.resolve();
    expect(readPermission).not.toHaveBeenCalled();
    expect(question()).toBeNull();
  });

  it("asks again on a join 30 days after Not now, while the system still hasn't asked", async () => {
    mockFiles.set(NOT_NOW, JSON.stringify({ at: new Date(Date.now() - NOTES_OFFER_AGAIN_AFTER_MS).toISOString() }));

    await renderAsk();

    await waitFor(() => expect(question()).toBeTruthy());
  });

  it("asks when what it remembered can't be read", async () => {
    mockFiles.set(NOT_NOW, "not json");

    await renderAsk();

    await waitFor(() => expect(question()).toBeTruthy());
  });

  it.each([
    ["the person didn't just join", false, "undetermined"],
    ["the system already asked and was refused", true, "denied"],
    ["notifications are already allowed", true, "granted"],
  ] as const)("does not ask when %s", async (_label, justJoined, permission) => {
    readPermission.mockResolvedValue(permission);

    await renderAsk({ justJoined });

    await settle();
    expect(question()).toBeNull();
  });

  it("does not ask when the permission can't be read", async () => {
    readPermission.mockRejectedValue(new Error("unavailable"));

    await renderAsk();

    await settle();
    expect(question()).toBeNull();
  });
});
