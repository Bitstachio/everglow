import { I18nProvider } from "@/providers/i18n-provider";
import { act, renderHook } from "@testing-library/react-native";
import { Alert, Clipboard, Share } from "react-native";
import { buildEvent, buildParticipant } from "../testing/fixtures";
import { useEnvelopeScreen } from "./use-envelope-screen";

type QueryState = { data?: unknown; isLoading?: boolean; isError?: boolean; isSuccess?: boolean };

const mockEventRefetch = jest.fn();
const mockParticipantsRefetch = jest.fn();
let mockEvent: QueryState = {};
let mockParticipants: QueryState = {};
jest.mock("../api/queries", () => ({
  useEventQuery: () => ({ isLoading: false, isError: false, ...mockEvent, refetch: mockEventRefetch }),
  useEventParticipantsQuery: () => ({
    isLoading: false,
    isError: false,
    isSuccess: Boolean(mockParticipants.data),
    ...mockParticipants,
    refetch: mockParticipantsRefetch,
  }),
}));
const mockRegenerate = jest.fn();
let mockRegenerating = false;
jest.mock("../api/mutations", () => ({
  useRegenerateInviteMutation: () => ({ mutateAsync: mockRegenerate, isPending: mockRegenerating }),
}));
jest.mock("@/context/auth-context", () => ({ useAuth: () => ({ user: { id: "user-1" } }) }));
const mockBack = jest.fn();
const mockReplace = jest.fn();
let mockCanGoBack = true;
jest.mock("expo-router", () => ({
  useRouter: () => ({ back: mockBack, replace: mockReplace, canGoBack: () => mockCanGoBack }),
  useLocalSearchParams: () => ({ id: "event-1" }),
}));

const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
const share = jest.spyOn(Share, "share");
const copy = jest.spyOn(Clipboard, "setString").mockImplementation(() => {});

const render = () => renderHook(() => useEnvelopeScreen(), { wrapper: I18nProvider });

beforeEach(() => {
  jest.clearAllMocks();
  mockCanGoBack = true;
  mockRegenerating = false;
  mockRegenerate.mockResolvedValue({});
  share.mockResolvedValue({ action: Share.sharedAction });
  mockEvent = {
    data: buildEvent({
      title: "Nadia turns 30",
      date: new Date(2026, 10, 7, 19, 0).toISOString(),
      galleryClosesAt: new Date(2026, 10, 14, 19, 0).toISOString(),
      usage: { members: 18, storageBytes: "0" },
    }),
  };
  mockParticipants = { data: [buildParticipant()] };
});

test("fills the adds-photos envelope in first", async () => {
  const { result } = await render();

  expect(result.current.edge).toBe("Envelope · Nadia turns 30");
  expect(result.current.envelope).toEqual({
    title: "Nadia turns 30",
    startsAt: "Sat 7 Nov, 7 pm",
    peopleCount: 18,
    pickUpBy: "14 Nov, then it’s gone",
    admits: "adds",
    accessibilityLabel: "Adds-photos envelope for Nadia turns 30",
  });
  expect(result.current.invitationUrl).toBe("https://events.everglow.app/invite/weekend");
  expect(result.current.kinds).toEqual([
    { key: "adds", label: "Adds photos" },
    { key: "view", label: "View only" },
  ]);
});

test("switches to the view-only envelope and its own link", async () => {
  const { result } = await render();
  await act(() => result.current.onSelectKind("view"));

  expect(result.current.kind).toBe("view");
  expect(result.current.envelope).toMatchObject({
    admits: "view",
    accessibilityLabel: "View-only envelope for Nadia turns 30",
  });
  expect(result.current.invitationUrl).toBe("https://events.everglow.app/invite/weekend-viewer");
});

test("a roll that never closes has no pick-up date", async () => {
  mockEvent = { data: buildEvent({ galleryClosesAt: null }) };
  const { result } = await render();
  expect(result.current.envelope?.pickUpBy).toBe("It stays open");
});

test("sends anyone but a host back to the roll", async () => {
  mockParticipants = { data: [buildParticipant({ accessLevel: "PARTICIPANT" })] };
  const { result } = await render();

  expect(result.current.envelope).toBeNull();
  expect(mockReplace).toHaveBeenCalledWith("/events/event-1");
});

test("waits for the roll before filling anything in", async () => {
  mockEvent = { isLoading: true };
  mockParticipants = { isLoading: true };
  const { result } = await render();

  expect(result.current).toMatchObject({ isLoading: true, envelope: null, edge: null, invitationUrl: null });
  expect(mockReplace).not.toHaveBeenCalled();
});

test("tries both requests again after a failure", async () => {
  mockEvent = { isError: true };
  const { result } = await render();
  expect(result.current.isError).toBe(true);

  result.current.onRetry();
  expect(mockEventRefetch).toHaveBeenCalledTimes(1);
  expect(mockParticipantsRefetch).toHaveBeenCalledTimes(1);
});

test("closing goes back, or to the roll when there is nothing to go back to", async () => {
  const { result } = await render();
  result.current.onClose();
  expect(mockBack).toHaveBeenCalledTimes(1);

  mockCanGoBack = false;
  result.current.onClose();
  expect(mockReplace).toHaveBeenCalledWith("/events/event-1");
});

test("05.3 shares the envelope's link through the share sheet", async () => {
  const { result } = await render();
  await act(() => result.current.onShare());

  expect(share).toHaveBeenCalledWith({
    message: "Nadia turns 30 · join the roll\nhttps://events.everglow.app/invite/weekend",
  });
});

test("says when the share sheet couldn't open", async () => {
  share.mockRejectedValueOnce(new Error("No share sheet"));
  const { result } = await render();
  await act(() => result.current.onShare());

  expect(alert).toHaveBeenCalledWith("Couldn’t share the link", expect.any(String));
});

test("copies the link and says so for a moment", async () => {
  jest.useFakeTimers();
  try {
    const { result } = await render();
    await act(() => result.current.onCopy());

    expect(copy).toHaveBeenCalledWith("https://events.everglow.app/invite/weekend");
    expect(result.current.copied).toBe(true);
    await act(() => jest.advanceTimersByTime(2000));
    expect(result.current.copied).toBe(false);
  } finally {
    jest.useRealTimers();
  }
});

test("switching envelopes forgets an earlier copy", async () => {
  const { result } = await render();
  await act(() => result.current.onCopy());
  await act(() => result.current.onSelectKind("view"));
  expect(result.current.copied).toBe(false);
});

test("05.5 the reset slip names the envelope and who stays", async () => {
  const { result } = await render();
  await act(() => result.current.onReset());

  expect(result.current.reset).toEqual({
    visible: true,
    edge: "Adds-photos envelope",
    body: "The current QR and link stop working at once and you get new ones. The view-only envelope keeps working, and the 18 people already in stay.",
    a11y: "Reset the adds-photos envelope",
    isResetting: false,
  });
});

test("resetting rotates only the chosen envelope and closes the slip", async () => {
  const { result } = await render();
  await act(() => result.current.onSelectKind("view"));
  await act(() => result.current.onReset());
  await act(() => result.current.onConfirmReset());

  expect(mockRegenerate).toHaveBeenCalledWith("VIEWER");
  expect(result.current.reset.visible).toBe(false);
  expect(alert).not.toHaveBeenCalled();
});

test("a failed reset closes the slip and says why", async () => {
  mockRegenerate.mockRejectedValueOnce(new Error("Too many requests"));
  const { result } = await render();
  await act(() => result.current.onReset());
  await act(() => result.current.onConfirmReset());

  expect(result.current.reset.visible).toBe(false);
  expect(alert).toHaveBeenCalledWith("Couldn’t reset the envelope", expect.any(String));
});

test("the slip stays while a reset is on its way", async () => {
  mockRegenerating = true;
  const { result } = await render();
  await act(() => result.current.onReset());
  await act(() => result.current.onCloseReset());
  expect(result.current.reset.visible).toBe(true);
});

test("one person on the roll reads in the singular", async () => {
  mockEvent = { data: buildEvent({ usage: { members: 1, storageBytes: "0" } }) };
  const { result } = await render();
  expect(result.current.reset.body).toMatch(/the person already in stays\.$/);
});

test("05.6 a closed roll's envelope is shut, with the day its photos went", async () => {
  mockEvent = {
    data: buildEvent({
      galleryState: "CLOSED",
      galleryClosesAt: new Date(2026, 8, 21, 12, 0).toISOString(),
      invites: [],
    }),
  };
  const { result } = await render();

  expect(result.current.state).toBe("closed");
  expect(result.current.shut).toEqual({
    state: "closed",
    stamp: "Closed",
    stampLine: "No new guests",
    date: "21 Sep",
  });
  expect(result.current.envelope).toMatchObject({ admits: "adds", pickUpBy: "21 Sep, gone" });
  expect(result.current.invitationUrl).toBeNull();
});

test("05.7 a roll under review is on hold, and its links are kept back", async () => {
  mockEvent = { data: buildEvent({ status: "UNDER_REVIEW" }) };
  const { result } = await render();
  await act(() => result.current.onSelectKind("view"));

  expect(result.current.shut).toEqual({
    state: "onHold",
    stamp: "On hold",
    stampLine: "Under review",
    date: undefined,
  });
  expect(result.current.envelope?.admits).toBe("adds");
  expect(result.current.invitationUrl).toBeNull();
});

test("a suspended roll's envelope is shut too", async () => {
  mockEvent = { data: buildEvent({ status: "SUSPENDED" }) };
  const { result } = await render();
  expect(result.current.shut).toMatchObject({ state: "suspended", stamp: "Suspended" });
});

test("an open roll's envelope is not shut", async () => {
  const { result } = await render();
  expect(result.current).toMatchObject({ state: "open", shut: null });
});
