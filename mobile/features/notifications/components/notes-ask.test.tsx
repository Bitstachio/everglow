import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import { renderWithI18n } from "@/testing/render";
import { registerThisDevice } from "../lib/device-registration";
import { askPushPermission, readPushPermission } from "../lib/push";
import { NotesAsk } from "./notes-ask";

let mockParams: { arrival?: string } = {};
const mockStore = new Map<string, string>();

jest.mock("expo-router", () => ({ useLocalSearchParams: () => mockParams }));
jest.mock("expo-secure-store", () => ({
  getItem: (key: string) => mockStore.get(key) ?? null,
  setItem: (key: string, value: string) => mockStore.set(key, value),
}));
// The sheet's own animation is tested with it; here only what it holds matters.
jest.mock("@/components/ui/bottom-sheet/bottom-sheet", () => ({
  BottomSheet: ({ visible, children }: { visible: boolean; children: React.ReactNode }) => (visible ? children : null),
}));
jest.mock("../lib/push", () => ({ readPushPermission: jest.fn(), askPushPermission: jest.fn() }));
jest.mock("../lib/device-registration", () => ({ registerThisDevice: jest.fn() }));

const readPermission = jest.mocked(readPushPermission);
const askPermission = jest.mocked(askPushPermission);
const register = jest.mocked(registerThisDevice);

beforeEach(() => {
  mockParams = { arrival: "joined" };
  mockStore.clear();
  jest.clearAllMocks();
  readPermission.mockResolvedValue("undetermined");
  askPermission.mockResolvedValue(true);
  register.mockResolvedValue(true);
});

const renderAsk = () => renderWithI18n(<NotesAsk />);

const question = () => screen.queryByText("Want a note when photos land?");

describe("NotesAsk (06.6)", () => {
  it("asks once someone has just joined and the system hasn't asked yet", async () => {
    await renderAsk();

    await waitFor(() => expect(question()).toBeTruthy());
  });

  it("turns notes on: the system prompt, then this phone is registered", async () => {
    await renderAsk();
    await waitFor(() => expect(question()).toBeTruthy());

    await fireEvent.press(screen.getByText("Turn on notes"));

    await waitFor(() => expect(mockStore.get("push.notes-asked")).toBe("1"));
    expect(askPermission).toHaveBeenCalled();
    expect(register).toHaveBeenCalled();
    await waitFor(() => expect(question()).toBeNull());
  });

  it("registers nothing when the person says no to the system prompt", async () => {
    askPermission.mockResolvedValue(false);
    await renderAsk();
    await waitFor(() => expect(question()).toBeTruthy());

    await fireEvent.press(screen.getByText("Turn on notes"));

    await waitFor(() => expect(mockStore.get("push.notes-asked")).toBe("1"));
    expect(register).not.toHaveBeenCalled();
    await waitFor(() => expect(question()).toBeNull());
  });

  it("Not now closes it without the system prompt, for good", async () => {
    await renderAsk();
    await waitFor(() => expect(question()).toBeTruthy());

    await fireEvent.press(screen.getByText("Not now"));

    expect(askPermission).not.toHaveBeenCalled();
    expect(mockStore.get("push.notes-asked")).toBe("1");
  });

  it.each([
    ["the roll was opened another way", { arrival: undefined }, "undetermined", false],
    ["the person was already on the roll", { arrival: "already" }, "undetermined", false],
    ["the system already asked", { arrival: "joined" }, "denied", false],
    ["this phone was asked before", { arrival: "joined" }, "undetermined", true],
  ])("does not ask when %s", async (_label, params, permission, askedBefore) => {
    mockParams = params;
    readPermission.mockResolvedValue(permission as "undetermined" | "denied");
    if (askedBefore) mockStore.set("push.notes-asked", "1");

    await renderAsk();

    // Let the permission check settle before looking.
    await waitFor(() => expect(readPermission.mock.results.every((r) => r.type === "return")).toBe(true));
    await Promise.resolve();
    expect(question()).toBeNull();
  });
});
