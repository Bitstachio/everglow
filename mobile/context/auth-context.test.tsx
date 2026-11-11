import { onAccountCleared } from "@/lib/account-cleared";
import * as beforeSignOut from "@/lib/before-sign-out";
import { onBeforeSignOut } from "@/lib/before-sign-out";
import { toApiError } from "@/lib/api/errors";
import { clearPendingInvite, savePendingInvite, takePendingInvite } from "@/lib/pending-invite";
import { renderWithI18n } from "@/testing/render";
import { I18nProvider } from "@/providers/i18n-provider";
import { dehydrate, onlineManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, renderHook, screen, waitFor } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { Pressable, Text } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider, useAuth } from "./auth-context";

const mockReplace = jest.fn();
const mockGetUserProfile = jest.fn();
let mockUnauthorized: ((code?: string) => void) | null = null;
let mockSuspended: (() => void) | null = null;
const mockLogoutFromAuth0 = jest.fn();
const mockStoredIdentity = jest.fn();
const mockLogin = jest.fn();

jest.mock("expo-router", () => ({
  router: { replace: (href: unknown) => mockReplace(href) },
  usePathname: () => "/events",
}));
jest.mock("@/lib/auth", () => ({ authService: { getUserProfile: () => mockGetUserProfile() } }));
jest.mock("@/lib/api/axios-instance", () => ({
  setUnauthorizedHandler: (handler: ((code?: string) => void) | null) => {
    mockUnauthorized = handler;
  },
  setSuspendedHandler: (handler: (() => void) | null) => {
    mockSuspended = handler;
  },
}));
const mockReadSnapshot = jest.fn();
const mockSaveSnapshot = jest.fn();
const mockRemoveSnapshot = jest.fn();
const mockClearImages = jest.fn();
jest.mock("@/lib/session-cache", () => ({
  readSessionSnapshot: (options: unknown) => mockReadSnapshot(options),
  saveSessionSnapshot: (snapshot: unknown) => mockSaveSnapshot(snapshot),
  removeSessionSnapshot: () => mockRemoveSnapshot(),
}));
jest.mock("@/lib/image-cache", () => ({ clearImageCaches: () => mockClearImages() }));
jest.mock("@/lib/auth0", () => ({
  isAuth0Configured: () => true,
  hasValidSession: async () => true,
  getSignedInIdentity: () => mockStoredIdentity(),
  clearLocalCredentials: async () => undefined,
  isUserCancellation: () => false,
  loginWithUniversalLogin: () => mockLogin(),
  logoutFromAuth0: () => mockLogoutFromAuth0(),
}));

const initialMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};
let queryClient: QueryClient;
const Providers = ({ children }: { children: ReactNode }) => (
  <SafeAreaProvider initialMetrics={initialMetrics}>
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  </SafeAreaProvider>
);
const SignOut = () => {
  const { logout } = useAuth();
  return (
    <Pressable accessibilityRole="button" onPress={() => void logout()}>
      <Text>Sign out</Text>
    </Pressable>
  );
};
const renderAuth = () =>
  renderHook(() => useAuth(), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <I18nProvider>
        <Providers>
          <AuthProvider>{children}</AuthProvider>
        </Providers>
      </I18nProvider>
    ),
  });
const renderProvider = () =>
  renderWithI18n(
    <AuthProvider>
      <Text>App</Text>
      <SignOut />
    </AuthProvider>,
    { wrapper: Providers },
  );

const offline = () => toApiError({ request: {}, message: "Network Error" });
const profile = { id: "u1", isOnboarded: true };
const ada = { sub: "auth0|ada", email: "ada@example.com", name: "Ada" };
const ben = { sub: "google-oauth2|ben", email: "ben@example.com", name: "Ben" };

beforeEach(() => {
  queryClient = new QueryClient();
  mockReplace.mockReset();
  mockGetUserProfile.mockReset();
  mockUnauthorized = null;
  mockSuspended = null;
  mockLogoutFromAuth0.mockReset().mockResolvedValue(undefined);
  clearPendingInvite();
  mockStoredIdentity.mockReset().mockResolvedValue(ada);
  mockLogin.mockReset().mockResolvedValue(ben);
  mockReadSnapshot.mockReset().mockReturnValue(null);
  mockSaveSnapshot.mockReset();
  mockRemoveSnapshot.mockReset();
  mockClearImages.mockReset();
  onlineManager.setOnline(true);
});

afterAll(() => onlineManager.setOnline(true));

/** What a launch with the network saved: the profile, and Home's rolls. */
const savedSession = () => {
  const source = new QueryClient();
  source.setQueryData(["rolls"], [{ id: "event-1", title: "Sam & Jo’s wedding" }]);
  const queries = dehydrate(source);
  source.clear();
  return { savedAt: Date.now(), userId: "u1", identity: ada, profile, queries };
};

describe("opening the app offline", () => {
  test("with a saved session goes straight in with the saved profile and rolls, no can't connect", async () => {
    mockGetUserProfile.mockRejectedValue(offline());
    mockReadSnapshot.mockReturnValue(savedSession());
    onlineManager.setOnline(false);

    const { result } = await renderAuth();

    await waitFor(() => expect(result.current.user).toEqual(profile));
    expect(mockReadSnapshot).toHaveBeenCalledWith({ sub: "auth0|ada" });
    expect(result.current.identity).toEqual(ada);
    expect(queryClient.getQueryData(["rolls"])).toEqual([{ id: "event-1", title: "Sam & Jo’s wedding" }]);
    expect(screen.queryByRole("header", { name: "The lab is out\nof reach." })).not.toBeOnTheScreen();
  });

  test("when Auth0 can't say who it is offline, the saved identity stands in", async () => {
    mockGetUserProfile.mockRejectedValue(offline());
    mockStoredIdentity.mockResolvedValue(null);
    mockReadSnapshot.mockReturnValue(savedSession());
    onlineManager.setOnline(false);

    const { result } = await renderAuth();

    await waitFor(() => expect(result.current.identity).toEqual(ada));
    expect(mockReadSnapshot).toHaveBeenCalledWith({ sub: undefined });
  });

  test("doesn't save what it loaded from the phone again, as if it were new", async () => {
    mockGetUserProfile.mockRejectedValue(offline());
    mockReadSnapshot.mockReturnValue(savedSession());
    onlineManager.setOnline(false);

    const { result } = await renderAuth();
    await waitFor(() => expect(result.current.user).toEqual(profile));
    await act(() => new Promise((resolve) => setTimeout(resolve, 1200)));

    expect(mockSaveSnapshot).not.toHaveBeenCalled();
  });

  test("loads the profile again once the network is back, and moves a suspended account on", async () => {
    mockGetUserProfile.mockRejectedValueOnce(offline()).mockResolvedValue({ ...profile, suspendedAt: "2026-11-11" });
    mockReadSnapshot.mockReturnValue(savedSession());
    onlineManager.setOnline(false);

    const { result } = await renderAuth();
    await waitFor(() => expect(result.current.user).toEqual(profile));
    expect(mockGetUserProfile).toHaveBeenCalledTimes(1);

    await act(async () => onlineManager.setOnline(true));

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/account-suspended"));
    expect(result.current.isSuspended).toBe(true);
  });

  test("a profile that arrives after signing out doesn't sign the person back in", async () => {
    let answer: (value: unknown) => void = () => undefined;
    mockGetUserProfile
      .mockRejectedValueOnce(offline())
      .mockImplementationOnce(() => new Promise((resolve) => (answer = resolve)));
    mockReadSnapshot.mockReturnValue(savedSession());
    onlineManager.setOnline(false);
    const { result } = await renderAuth();
    await waitFor(() => expect(result.current.user).toEqual(profile));
    await act(async () => onlineManager.setOnline(true));
    await waitFor(() => expect(mockGetUserProfile).toHaveBeenCalledTimes(2));

    await act(() => result.current.logout());
    await act(async () => answer(profile));

    expect(result.current.user).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
  });

  test("back online, an unchanged profile stays where it is and is saved again", async () => {
    mockGetUserProfile.mockRejectedValueOnce(offline()).mockResolvedValue(profile);
    mockReadSnapshot.mockReturnValue(savedSession());
    onlineManager.setOnline(false);

    const { result } = await renderAuth();
    await waitFor(() => expect(result.current.user).toEqual(profile));
    await act(async () => onlineManager.setOnline(true));

    await waitFor(() => expect(mockGetUserProfile).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(mockSaveSnapshot).toHaveBeenCalled(), { timeout: 3000 });
    expect(mockReplace).not.toHaveBeenCalled();
  });
});

test("a profile loaded from the API is saved for the next offline launch", async () => {
  mockGetUserProfile.mockResolvedValue(profile);
  await renderProvider();
  await screen.findByText("App");

  await waitFor(() => expect(mockSaveSnapshot).toHaveBeenCalled(), { timeout: 3000 });
  expect(mockSaveSnapshot.mock.calls[0][0]).toMatchObject({ userId: "u1", identity: ada, profile });
});

test("signing out deletes the saved session and every cached image", async () => {
  mockGetUserProfile.mockResolvedValue(profile);
  await renderProvider();
  await screen.findByText("App");

  fireEvent.press(screen.getByRole("button", { name: "Sign out" }));

  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/login"));
  expect(mockRemoveSnapshot).toHaveBeenCalled();
  expect(mockClearImages).toHaveBeenCalled();
});

test("an expired session deletes the saved session and every cached image too", async () => {
  mockGetUserProfile.mockResolvedValue(profile);
  await renderProvider();
  await screen.findByText("App");

  await act(async () => mockUnauthorized?.());

  await waitFor(() => expect(mockRemoveSnapshot).toHaveBeenCalled());
  expect(mockClearImages).toHaveBeenCalled();
});

test("opening the app offline with nothing saved keeps the session and offers to try again", async () => {
  mockGetUserProfile.mockRejectedValueOnce(offline()).mockResolvedValueOnce(profile);
  await renderProvider();

  expect(await screen.findByRole("header", { name: "The lab is out\nof reach." })).toBeOnTheScreen();
  expect(screen.getByText("App")).toBeOnTheScreen();

  fireEvent.press(screen.getByRole("button", { name: "Try again" }));
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/events"));
  expect(screen.queryByText("The lab is out")).not.toBeOnTheScreen();
});

test("a retry that is still offline stays on can't connect", async () => {
  mockGetUserProfile.mockRejectedValue(offline());
  await renderProvider();
  fireEvent.press(await screen.findByRole("button", { name: "Try again" }));
  await waitFor(() => expect(mockGetUserProfile).toHaveBeenCalledTimes(2));
  expect(screen.getByRole("header", { name: "The lab is out\nof reach." })).toBeOnTheScreen();
  expect(mockReplace).not.toHaveBeenCalled();
});

test("an answer from the API that isn't a connection failure goes to the welcome", async () => {
  mockGetUserProfile.mockRejectedValue(toApiError({ response: { status: 500 } }));
  jest.spyOn(console, "error").mockImplementation(() => undefined);
  await renderProvider();
  expect(await screen.findByText("App")).toBeOnTheScreen();
  expect(screen.queryByText("Try again")).not.toBeOnTheScreen();
});

test("a 401 sends the person to the welcome with the signed-out slip", async () => {
  mockGetUserProfile.mockResolvedValue(profile);
  await renderProvider();
  await screen.findByText("App");
  await act(async () => mockUnauthorized?.());
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith({ pathname: "/login", params: { signedOut: "1" } }));
});

test("signing out drops everything cached for the account", async () => {
  mockGetUserProfile.mockResolvedValue(profile);
  await renderProvider();
  await screen.findByText("App");
  queryClient.setQueryData(["blocks"], [{ userId: "u2" }]);

  fireEvent.press(screen.getByRole("button", { name: "Sign out" }));
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/login"));
  expect(queryClient.getQueryData(["blocks"])).toBeUndefined();
});

test("a 401 drops everything cached for the account", async () => {
  mockGetUserProfile.mockResolvedValue(profile);
  await renderProvider();
  await screen.findByText("App");
  queryClient.setQueryData(["blocks"], [{ userId: "u2" }]);

  await act(async () => mockUnauthorized?.());
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith({ pathname: "/login", params: { signedOut: "1" } }));
  expect(queryClient.getQueryData(["blocks"])).toBeUndefined();
});

test("a 401 clears the account but tells local stores the session expired, so they keep its data", async () => {
  const reasons: string[] = [];
  const stop = onAccountCleared((reason) => reasons.push(reason));
  try {
    mockGetUserProfile.mockResolvedValue(profile);
    await renderProvider();
    await screen.findByText("App");
    await act(async () => mockUnauthorized?.());
    await waitFor(() => expect(reasons).toEqual(["sessionExpired"]));
  } finally {
    stop();
  }
});

test("an account being deleted is cleared for good, and the welcome says it is being deleted", async () => {
  const reasons: string[] = [];
  const stop = onAccountCleared((reason) => reasons.push(reason));
  try {
    mockGetUserProfile.mockResolvedValue(profile);
    await renderProvider();
    await screen.findByText("App");
    await act(async () => mockUnauthorized?.("ACCOUNT_DELETION_IN_PROGRESS"));
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith({ pathname: "/login", params: { deleting: "1" } }));
    // Nothing the account picked stays on the phone, unlike an expired session.
    expect(reasons).toEqual(["signedOut"]);
  } finally {
    stop();
  }
});

test("a deliberate sign-out clears the account for good", async () => {
  const reasons: string[] = [];
  const stop = onAccountCleared((reason) => reasons.push(reason));
  try {
    mockGetUserProfile.mockResolvedValue(profile);
    await renderProvider();
    await screen.findByText("App");
    fireEvent.press(screen.getByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(reasons).toEqual(["signedOut"]));
  } finally {
    stop();
  }
});

test("a suspended account is routed to its own screen once it loads", async () => {
  mockGetUserProfile.mockRejectedValueOnce(offline()).mockResolvedValueOnce({ ...profile, suspendedAt: "2026-10-01" });
  await renderProvider();

  fireEvent.press(await screen.findByRole("button", { name: "Try again" }));
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/account-suspended"));
});

const SignOutProbe = () => {
  const { logout, isAuthenticated } = useAuth();
  return isAuthenticated ? <Text onPress={() => void logout("/account-deleted")}>Deleted</Text> : null;
};
const renderSignOutProbe = () =>
  renderWithI18n(
    <AuthProvider>
      <SignOutProbe />
    </AuthProvider>,
    { wrapper: Providers },
  );

test("signing out after deleting the account lands on Deleted, not the welcome", async () => {
  mockGetUserProfile.mockResolvedValue(profile);
  await renderSignOutProbe();
  fireEvent.press(await screen.findByText("Deleted"));

  await waitFor(() => expect(mockReplace).toHaveBeenLastCalledWith("/account-deleted"));
});

test("a deleted account's 401s during and after the sign-out leave Deleted on screen", async () => {
  mockGetUserProfile.mockResolvedValue(profile);
  let finishSignOut!: () => void;
  mockLogoutFromAuth0.mockReturnValue(new Promise<void>((resolve) => (finishSignOut = resolve)));
  const { result } = await renderAuth();
  await waitFor(() => expect(result.current.isAuthenticated).toBe(true));

  let signingOut!: Promise<void>;
  await act(async () => {
    signingOut = result.current.logout("/account-deleted");
  });
  // A refetch while Auth0 clears the session, and one that lands after it.
  await act(async () => mockUnauthorized?.());
  await act(async () => {
    finishSignOut();
    await signingOut;
  });
  await act(async () => mockUnauthorized?.());

  expect(mockReplace).toHaveBeenCalledTimes(1);
  expect(mockReplace).toHaveBeenLastCalledWith("/account-deleted");
});

const SuspendedProbe = () => <Text>{useAuth().isSuspended ? "On hold" : "App"}</Text>;

test("a request refused with ACCOUNT_SUSPENDED mid-session reloads the account once and opens 14.13", async () => {
  mockGetUserProfile.mockResolvedValue(profile);
  await renderWithI18n(
    <AuthProvider>
      <SuspendedProbe />
    </AuthProvider>,
    { wrapper: Providers },
  );
  await screen.findByText("App");
  const calls = mockGetUserProfile.mock.calls.length;
  mockGetUserProfile.mockResolvedValue({ ...profile, suspendedAt: "2026-10-01" });

  await act(async () => {
    mockSuspended?.();
    mockSuspended?.();
  });
  expect(await screen.findByText("On hold")).toBeOnTheScreen();
  expect(mockReplace).toHaveBeenCalledWith("/account-suspended");
  expect(mockGetUserProfile).toHaveBeenCalledTimes(calls + 1);

  // Already suspended: the screen's own refused requests don't loop.
  await act(async () => mockSuspended?.());
  expect(mockGetUserProfile).toHaveBeenCalledTimes(calls + 1);
  expect(mockReplace).toHaveBeenCalledTimes(1);
});

const SignIn = () => {
  const { login } = useAuth();
  return (
    <Pressable accessibilityRole="button" onPress={() => void login()}>
      <Text>Sign in</Text>
    </Pressable>
  );
};

const renderSignedOut = async () => {
  mockGetUserProfile.mockResolvedValueOnce(null);
  await renderWithI18n(
    <AuthProvider>
      <SignIn />
    </AuthProvider>,
    { wrapper: Providers },
  );
  await screen.findByText("Sign in");
};

test("signing in opens the envelope that was waiting (06.3)", async () => {
  await renderSignedOut();
  savePendingInvite("k8Qm2");
  mockGetUserProfile.mockResolvedValue(profile);

  fireEvent.press(screen.getByRole("button", { name: "Sign in" }));

  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/join/k8Qm2"));
  expect(takePendingInvite()).toBeNull();
});

test("signing in before onboarding keeps the invite waiting for the end of it", async () => {
  await renderSignedOut();
  savePendingInvite("k8Qm2");
  mockGetUserProfile.mockResolvedValue({ ...profile, isOnboarded: false });

  fireEvent.press(screen.getByRole("button", { name: "Sign in" }));

  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/onboarding"));
  expect(takePendingInvite()).toBe("k8Qm2");
});

test("signing out forgets a waiting invite, so the next account doesn't open it", async () => {
  mockGetUserProfile.mockResolvedValue(profile);
  await renderProvider();
  await screen.findByText("App");
  savePendingInvite("k8Qm2");

  fireEvent.press(screen.getByRole("button", { name: "Sign out" }));

  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/login"));
  expect(takePendingInvite()).toBeNull();
});

test("opening the app with a session knows who is signed in", async () => {
  mockGetUserProfile.mockResolvedValue(profile);
  const { result } = await renderAuth();

  await waitFor(() => expect(result.current.identity).toEqual(ada));
});

test("signing out forgets who was signed in, and the next sign-in is someone else", async () => {
  mockGetUserProfile.mockResolvedValue(profile);
  const { result } = await renderAuth();
  await waitFor(() => expect(result.current.identity).toEqual(ada));

  await act(async () => result.current.logout());
  expect(result.current.identity).toBeNull();

  await act(async () => result.current.login());
  expect(result.current.identity).toEqual(ben);
});

test("signing out runs the before-sign-out work while the session still works", async () => {
  mockGetUserProfile.mockResolvedValue(profile);
  const order: string[] = [];
  const unsubscribe = onBeforeSignOut(({ reason }) => {
    order.push(`before:${reason}`);
    return Promise.resolve();
  });
  mockLogoutFromAuth0.mockImplementation(() => {
    order.push("auth0");
    return Promise.resolve();
  });
  const { result } = await renderAuth();
  await waitFor(() => expect(result.current.identity).toEqual(ada));

  await act(async () => result.current.logout());
  await act(async () => result.current.logout("/account-deleted", "accountDeleted"));
  unsubscribe();

  expect(order).toEqual(["before:signedOut", "auth0", "before:accountDeleted", "auth0"]);
});

test("a before-sign-out handler that throws at once still lets Auth0 sign out", async () => {
  mockGetUserProfile.mockResolvedValue(profile);
  const unsubscribe = onBeforeSignOut(() => {
    throw new Error("not async");
  });
  const { result } = await renderAuth();
  await waitFor(() => expect(result.current.identity).toEqual(ada));

  await act(async () => result.current.logout());
  unsubscribe();

  expect(mockLogoutFromAuth0).toHaveBeenCalledTimes(1);
  expect(result.current.identity).toBeNull();
});

test("Auth0 signs out even when the before-sign-out work itself fails", async () => {
  mockGetUserProfile.mockResolvedValue(profile);
  const run = jest.spyOn(beforeSignOut, "runBeforeSignOut").mockRejectedValueOnce(new Error("broken"));
  const error = jest.spyOn(console, "error").mockImplementation(() => undefined);
  const { result } = await renderAuth();
  await waitFor(() => expect(result.current.identity).toEqual(ada));

  await act(async () => result.current.logout());
  run.mockRestore();
  error.mockRestore();

  expect(mockLogoutFromAuth0).toHaveBeenCalledTimes(1);
  expect(mockReplace).toHaveBeenLastCalledWith("/login");
});

test("a 401 forgets who was signed in", async () => {
  mockGetUserProfile.mockResolvedValue(profile);
  const { result } = await renderAuth();
  await waitFor(() => expect(result.current.identity).toEqual(ada));

  await act(async () => mockUnauthorized?.());
  await waitFor(() => expect(result.current.identity).toBeNull());
});
