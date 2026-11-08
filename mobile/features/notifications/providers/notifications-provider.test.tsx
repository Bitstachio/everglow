import { render } from "@testing-library/react-native";
import * as Notifications from "expo-notifications";
import { runAccountCleared } from "@/lib/account-cleared";
import { runBeforeSignOut } from "@/lib/before-sign-out";
import { resetDeviceRegistration, unregisterThisDevice } from "../lib/device-registration";
import { forgetTaps } from "../lib/notification-taps";
import { NotificationsProvider } from "./notifications-provider";

const ROLL = "11111111-1111-4111-8111-111111111111";
const OTHER_ROLL = "22222222-2222-4222-8222-222222222222";
let mockPathname = "/events";

jest.mock("expo-notifications", () => ({ setNotificationHandler: jest.fn() }));
jest.mock("expo-router", () => ({ usePathname: () => mockPathname }));
jest.mock("../hooks/use-push-registration", () => ({ usePushRegistration: jest.fn() }));
jest.mock("../hooks/use-notification-taps", () => ({ useNotificationTaps: jest.fn() }));
jest.mock("../lib/device-registration", () => ({
  unregisterThisDevice: jest.fn(() => Promise.resolve()),
  resetDeviceRegistration: jest.fn(),
}));
jest.mock("../lib/notification-taps", () => ({ forgetTaps: jest.fn() }));

const setHandler = jest.mocked(Notifications.setNotificationHandler);

const arriving = (url: string) =>
  ({ request: { identifier: "system-1", content: { data: { url, notificationId: "n1" } } } }) as never;

const handler = () => {
  const current = setHandler.mock.calls.at(-1)?.[0];
  if (!current) throw new Error("No notification handler");
  return current;
};

beforeEach(() => {
  jest.clearAllMocks();
  mockPathname = "/events";
});

test("signing out unregisters this phone, but not after the account was deleted", async () => {
  const { unmount } = await render(<NotificationsProvider />);

  await runBeforeSignOut({ reason: "accountDeleted" });
  expect(unregisterThisDevice).not.toHaveBeenCalled();

  await runBeforeSignOut({ reason: "signedOut" });
  expect(unregisterThisDevice).toHaveBeenCalledTimes(1);
  await unmount();
});

test("a cleared account takes its registration and unopened taps with it", async () => {
  const { unmount } = await render(<NotificationsProvider />);

  runAccountCleared("sessionExpired");

  expect(resetDeviceRegistration).toHaveBeenCalledWith("sessionExpired");
  expect(forgetTaps).toHaveBeenCalledTimes(1);
  await unmount();
});

test("unmounting undoes the wiring", async () => {
  const { unmount } = await render(<NotificationsProvider />);
  await unmount();

  await runBeforeSignOut({ reason: "signedOut" });
  runAccountCleared("signedOut");

  expect(unregisterThisDevice).not.toHaveBeenCalled();
  expect(resetDeviceRegistration).not.toHaveBeenCalled();
  expect(setHandler).toHaveBeenLastCalledWith(null);
});

describe("in the foreground", () => {
  it("shows a quiet banner and keeps it in the list", async () => {
    const { unmount } = await render(<NotificationsProvider />);

    await expect(handler().handleNotification(arriving(`/events/${ROLL}`))).resolves.toEqual({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    });
    await unmount();
  });

  it.each([`/events/${ROLL}`, `/events/${ROLL}/tray`])("shows no banner about the roll open at %s", async (path) => {
    mockPathname = path;
    const { unmount } = await render(<NotificationsProvider />);

    await expect(handler().handleNotification(arriving(`/events/${ROLL}`))).resolves.toEqual(
      expect.objectContaining({ shouldShowBanner: false, shouldShowList: true }),
    );
    await unmount();
  });

  it("still shows one about another roll", async () => {
    mockPathname = `/events/${OTHER_ROLL}`;
    const { unmount } = await render(<NotificationsProvider />);

    await expect(handler().handleNotification(arriving(`/events/${ROLL}`))).resolves.toEqual(
      expect.objectContaining({ shouldShowBanner: true }),
    );
    await unmount();
  });

  it("follows the screen as it changes", async () => {
    const { rerender, unmount } = await render(<NotificationsProvider />);
    mockPathname = `/events/${ROLL}`;
    await rerender(<NotificationsProvider />);

    await expect(handler().handleNotification(arriving(`/events/${ROLL}`))).resolves.toEqual(
      expect.objectContaining({ shouldShowBanner: false }),
    );
    await unmount();
  });
});
