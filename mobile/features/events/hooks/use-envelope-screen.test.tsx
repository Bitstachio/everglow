import { I18nProvider } from "@/providers/i18n-provider";
import { act, renderHook } from "@testing-library/react-native";
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
jest.mock("@/context/auth-context", () => ({ useAuth: () => ({ user: { id: "user-1" } }) }));
const mockBack = jest.fn();
const mockReplace = jest.fn();
let mockCanGoBack = true;
jest.mock("expo-router", () => ({
  useRouter: () => ({ back: mockBack, replace: mockReplace, canGoBack: () => mockCanGoBack }),
  useLocalSearchParams: () => ({ id: "event-1" }),
}));

const render = () => renderHook(() => useEnvelopeScreen(), { wrapper: I18nProvider });

beforeEach(() => {
  jest.clearAllMocks();
  mockCanGoBack = true;
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
    note: "they add photos too",
    accessibilityLabel: "Adds-photos envelope for Nadia turns 30",
  });
  expect(result.current.invitationUrl).toBe("https://events.everglow.app/invite/weekend");
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
