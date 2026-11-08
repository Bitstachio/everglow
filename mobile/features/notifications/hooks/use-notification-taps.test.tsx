import { act, renderHook } from "@testing-library/react-native";
import { forgetTaps } from "../lib/notification-taps";
import { useNotificationTaps } from "./use-notification-taps";

type Response = {
  actionIdentifier: string;
  notification: { request: { identifier: string; content: { data: Record<string, unknown> } } };
};

const DEFAULT_ACTION = "expo.modules.notifications.actions.DEFAULT";
const ROLL = "/events/11111111-1111-4111-8111-111111111111";

let mockResponse: Response | null = null;
const mockSubscribers = new Set<() => void>();
const mockSetResponse = (response: Response | null) => {
  mockResponse = response;
  mockSubscribers.forEach((notify) => notify());
};
const mockPush = jest.fn();
let mockPathname = "/events";
let mockAuth = { isAuthenticated: true, isOnboarded: true, isSuspended: false };

// The last response as expo-notifications keeps it: set at launch or by a tap while running, cleared on request.
jest.mock("expo-notifications", () => {
  const { useSyncExternalStore } = jest.requireActual<typeof import("react")>("react");
  return {
    DEFAULT_ACTION_IDENTIFIER: "expo.modules.notifications.actions.DEFAULT",
    useLastNotificationResponse: () =>
      useSyncExternalStore(
        (notify: () => void) => {
          mockSubscribers.add(notify);
          return () => mockSubscribers.delete(notify);
        },
        () => mockResponse,
      ),
    clearLastNotificationResponse: () => mockSetResponse(null),
  };
});
jest.mock("expo-router", () => ({
  router: { push: (...args: unknown[]) => mockPush(...args) },
  usePathname: () => mockPathname,
}));
jest.mock("@/context/auth-context", () => ({ useAuth: () => mockAuth }));

const tap = (identifier: string, data: Record<string, unknown>, actionIdentifier = DEFAULT_ACTION): Response => ({
  actionIdentifier,
  notification: { request: { identifier, content: { data } } },
});

beforeEach(() => {
  forgetTaps();
  mockPush.mockReset();
  mockPathname = "/events";
  mockAuth = { isAuthenticated: true, isOnboarded: true, isSuspended: false };
});

const renderTaps = () => renderHook(() => useNotificationTaps());

test("a tap that woke the app opens its roll once Home is up, and is cleared", async () => {
  mockSetResponse(tap("system-1", { url: ROLL, notificationId: "n1" }));

  await renderTaps();

  expect(mockPush).toHaveBeenCalledWith(ROLL);
  expect(mockResponse).toBeNull();
});

test("a tap while the app is running opens its roll", async () => {
  await renderTaps();

  await act(async () => mockSetResponse(tap("system-1", { url: `${ROLL}/tray`, notificationId: "n1" })));

  expect(mockPush).toHaveBeenCalledWith(`${ROLL}/tray`);
});

test("the same notification opens once, whichever way it reached the app", async () => {
  mockSetResponse(tap("launch-id", { url: ROLL, notificationId: "n1" }));
  await renderTaps();

  await act(async () => mockSetResponse(tap("listener-id", { url: ROLL, notificationId: "n1" })));

  expect(mockPush).toHaveBeenCalledTimes(1);
});

test("waits for the account, then opens", async () => {
  mockAuth = { isAuthenticated: false, isOnboarded: false, isSuspended: false };
  mockPathname = "/";
  mockSetResponse(tap("system-1", { url: ROLL, notificationId: "n1" }));
  const { rerender } = await renderTaps();
  expect(mockPush).not.toHaveBeenCalled();

  mockAuth = { isAuthenticated: true, isOnboarded: true, isSuspended: false };
  await rerender({});
  expect(mockPush).not.toHaveBeenCalled();

  mockPathname = "/events";
  await rerender({});
  expect(mockPush).toHaveBeenCalledWith(ROLL);
});

test.each(["/", "/login", "/onboarding", "/onboarding/username", "/account-suspended"])(
  "doesn't open over %s",
  async (pathname) => {
    mockPathname = pathname;
    mockSetResponse(tap("system-1", { url: ROLL, notificationId: "n1" }));

    await renderTaps();

    expect(mockPush).not.toHaveBeenCalled();
    expect(mockResponse).not.toBeNull();
  },
);

test.each([
  ["before onboarding", { isAuthenticated: true, isOnboarded: false, isSuspended: false }],
  ["while suspended", { isAuthenticated: true, isOnboarded: true, isSuspended: true }],
])("doesn't open %s", async (_label, auth) => {
  mockAuth = auth;
  mockSetResponse(tap("system-1", { url: ROLL, notificationId: "n1" }));

  await renderTaps();

  expect(mockPush).not.toHaveBeenCalled();
});

test("a tap the previous account left unopened never opens for the next one", async () => {
  mockAuth = { isAuthenticated: false, isOnboarded: false, isSuspended: false };
  mockPathname = "/login";
  mockSetResponse(tap("system-1", { url: ROLL, notificationId: "n1" }));
  const { rerender } = await renderTaps();

  // The auth context clears the account (lib/account-cleared.ts).
  await act(async () => forgetTaps());
  mockAuth = { isAuthenticated: true, isOnboarded: true, isSuspended: false };
  mockPathname = "/events";
  await rerender({});

  expect(mockPush).not.toHaveBeenCalled();
});

test("a tap on a path it may not open is dropped", async () => {
  mockSetResponse(tap("system-1", { url: "/delete-account", notificationId: "n1" }));

  await renderTaps();

  expect(mockPush).not.toHaveBeenCalled();
  expect(mockResponse).toBeNull();
});

test("an action button opens nothing", async () => {
  mockSetResponse(tap("system-1", { url: ROLL, notificationId: "n1" }, "dismiss"));

  await renderTaps();

  expect(mockPush).not.toHaveBeenCalled();
});

test("without a notificationId, the system's id tells taps apart", async () => {
  await renderTaps();

  await act(async () => mockSetResponse(tap("system-1", { url: ROLL })));
  await act(async () => mockSetResponse(tap("system-1", { url: ROLL })));
  await act(async () => mockSetResponse(tap("system-2", { url: ROLL })));

  expect(mockPush).toHaveBeenCalledTimes(2);
});
