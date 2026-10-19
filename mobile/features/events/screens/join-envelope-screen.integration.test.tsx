import "../testing/native-mocks";
import { createApiError } from "@/lib/api/errors";
import { renderWithI18n } from "@/testing/render";
// Integration tests compose the real screen with its data hooks.
// eslint-disable-next-line no-restricted-imports
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { screen, userEvent, waitFor } from "@testing-library/react-native";
// Observe the native alert boundary without replacing screen hooks.
// eslint-disable-next-line no-restricted-imports
import { Alert } from "react-native";
import JoinEnvelopeScreen from "./join-envelope-screen";
import { buildEvent, buildInvitePreview, deferred } from "../testing/fixtures";
import type { InvitePreviewResponseDto } from "../types";

const mockPreview = jest.fn();
const mockJoin = jest.fn();
const mockUnblock = jest.fn();
const mockRouter = { replace: jest.fn(), back: jest.fn(), dismissTo: jest.fn(), canGoBack: jest.fn(() => true) };
let mockToken: string | string[] = "k8Qm2";
jest.mock("@/lib/api/generated/client.gen", () => ({ client: { getConfig: () => ({}) } }));
jest.mock("@/lib/api/generated", () => ({
  eventsControllerPreviewInvite: (...args: unknown[]) => mockPreview(...args),
  eventsControllerJoin: (...args: unknown[]) => mockJoin(...args),
  blocksControllerUnblock: (...args: unknown[]) => mockUnblock(...args),
}));
jest.mock("@/context/auth-context", () => ({ useAuth: () => ({ user: { id: "me" }, updateUser: jest.fn() }) }));
jest.mock("expo-router", () => ({
  router: {
    replace: (...args: unknown[]) => mockRouter.replace(...args),
    back: () => mockRouter.back(),
    dismissTo: (...args: unknown[]) => mockRouter.dismissTo(...args),
    canGoBack: () => mockRouter.canGoBack(),
  },
  useLocalSearchParams: () => ({ token: mockToken }),
}));

const previewed = (overrides: Partial<InvitePreviewResponseDto> = {}) =>
  Promise.resolve({ data: { data: buildInvitePreview(overrides), meta: {} } });

const refused = (status: number, code?: string) => Promise.reject(createApiError("refused", { status, code }));

const renderScreen = () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false, gcTime: 0 } },
  });
  return renderWithI18n(
    <QueryClientProvider client={client}>
      <JoinEnvelopeScreen />
    </QueryClientProvider>,
  );
};

/** Stamps repeat the copy beside them, so assistive tech skips them. */
const stampText = (text: string) => screen.getByText(text, { includeHiddenElements: true });

const press = async (name: string | RegExp) => userEvent.setup().press(screen.getByRole("button", { name }));

beforeEach(() => {
  jest.clearAllMocks();
  mockToken = "k8Qm2";
  mockRouter.canGoBack.mockReturnValue(true);
  mockPreview.mockImplementation(() => previewed());
  mockJoin.mockResolvedValue({
    data: { data: buildEvent({ id: "roll-1", usage: { members: 25, storageBytes: "0" } }) },
  });
  mockUnblock.mockResolvedValue({ data: undefined });
  jest.spyOn(Alert, "alert").mockImplementation(() => {});
});

describe("06.4 The envelope", () => {
  test("shows whose roll it is, who's on it, when to pick up, and what it admits", async () => {
    await renderScreen();

    expect(await screen.findByText("Sam & Jo’s wedding")).toBeOnTheScreen();
    expect(screen.getByText("Sun 18 Oct, 4 pm")).toBeOnTheScreen();
    expect(screen.getByText("24 people so far")).toBeOnTheScreen();
    expect(screen.getByText("17 Nov, then it’s gone")).toBeOnTheScreen();
    expect(screen.getByText("Scan with any camera")).toBeOnTheScreen();
    expect(screen.getByLabelText("QR code: https://events.everglow.app/invite/k8Qm2")).toBeOnTheScreen();
    expect(screen.getByText("Invited by Sam · it’s free")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Join and add photos" })).toBeOnTheScreen();
    expect(mockPreview).toHaveBeenCalledWith({
      path: { token: "k8Qm2" },
      signal: expect.any(AbortSignal),
      throwOnError: true,
    });
  });

  test("06.5 says a view-only envelope lets them look", async () => {
    mockPreview.mockImplementation(() => previewed({ accessLevel: "VIEWER" }));
    await renderScreen();

    expect(await screen.findByRole("button", { name: "Join to look" })).toBeOnTheScreen();
    expect(screen.getByText("Admits: view only")).toBeOnTheScreen();
    expect(screen.getByText("You can look and save · invited by Sam")).toBeOnTheScreen();
  });

  test("names the host plainly when their profile is gone, and leaves pick-up out on a roll that never closes", async () => {
    mockPreview.mockImplementation(() => previewed({ host: null, galleryClosesAt: null }));
    await renderScreen();

    expect(await screen.findByText("Invited by the host · it’s free")).toBeOnTheScreen();
    expect(screen.getByText("— — —")).toBeOnTheScreen();
  });

  test("waits on the envelope before offering to join", async () => {
    const pending = deferred<unknown>();
    mockPreview.mockReturnValue(pending.promise);
    await renderScreen();

    expect(screen.getByLabelText("Opening the envelope")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Join and add photos" })).toBeDisabled();
    pending.resolve({ data: { data: buildInvitePreview() } });
    expect(await screen.findByText("Sam & Jo’s wedding")).toBeOnTheScreen();
  });

  test("reads the token from the route even when it comes as a list", async () => {
    mockToken = ["k8Qm2", "other"];
    await renderScreen();

    await screen.findByText("Sam & Jo’s wedding");
    expect(mockPreview).toHaveBeenCalledWith(expect.objectContaining({ path: { token: "k8Qm2" } }));
  });
});

describe("06.6 Joining", () => {
  test("joins and opens the roll with which member they became", async () => {
    await renderScreen();
    await screen.findByText("Sam & Jo’s wedding");

    await press("Join and add photos");

    await waitFor(() =>
      expect(mockRouter.replace).toHaveBeenCalledWith({
        pathname: "/events/[id]",
        params: { id: "roll-1", arrival: "joined", place: "25" },
      }),
    );
    expect(mockJoin).toHaveBeenCalledWith({ body: { invitationUrl: "k8Qm2" }, throwOnError: true });
  });

  test("joins once however often the leader is pressed", async () => {
    const pending = deferred<unknown>();
    mockJoin.mockReturnValue(pending.promise);
    await renderScreen();
    await screen.findByText("Sam & Jo’s wedding");

    await press("Join and add photos");
    await press("Join and add photos");

    expect(mockJoin).toHaveBeenCalledTimes(1);
    pending.resolve({ data: { data: buildEvent({ id: "roll-1" }) } });
  });

  test("shows the roll as it is now when it changed since the envelope opened", async () => {
    mockJoin.mockImplementation(() => refused(403, "EVENT_MEMBER_LIMIT_REACHED"));
    await renderScreen();
    await screen.findByText("Sam & Jo’s wedding");
    mockPreview.mockImplementation(() => previewed({ state: "EVENT_MEMBER_LIMIT_REACHED", memberCount: 30 }));

    await press("Join and add photos");

    expect(await screen.findByText("are taken.", { exact: false })).toBeOnTheScreen();
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  test("says so when joining fails for another reason, and stays on the envelope", async () => {
    mockJoin.mockImplementation(() => refused(429, "RATE_LIMIT_EXCEEDED"));
    await renderScreen();
    await screen.findByText("Sam & Jo’s wedding");

    await press("Join and add photos");

    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith("Couldn’t join", expect.any(String)));
    expect(screen.getByRole("button", { name: "Join and add photos" })).toBeEnabled();
  });
});

describe("06.7 Already in", () => {
  test("opens the roll with a note instead of the envelope", async () => {
    mockPreview.mockImplementation(() => previewed({ state: "ALREADY_A_MEMBER", eventId: "roll-1" }));
    await renderScreen();

    await waitFor(() =>
      expect(mockRouter.replace).toHaveBeenCalledWith({
        pathname: "/events/[id]",
        params: { id: "roll-1", arrival: "already" },
      }),
    );
    expect(screen.queryByRole("button", { name: "Join and add photos" })).toBeDisabled();
  });
});

describe("Refusals", () => {
  test("06.8 the roll is full, with the limit the plan sets", async () => {
    mockPreview.mockImplementation(() => previewed({ state: "EVENT_MEMBER_LIMIT_REACHED", memberCount: 30 }));
    await renderScreen();

    expect(await screen.findByText(/All 30 spots/)).toBeOnTheScreen();
    expect(screen.getByText("Sam’s roll holds 30 people. Ask Sam to make room.")).toBeOnTheScreen();
    expect(stampText("Returned")).toBeOnTheScreen();
    expect(stampText("Roll full")).toBeOnTheScreen();
    expect(screen.getByRole("header", { name: "Sam & Jo’s wedding" })).toBeOnTheScreen();
    expect(screen.queryByLabelText(/QR code/)).not.toBeOnTheScreen();

    await press("Back to your rolls");
    expect(mockRouter.dismissTo).toHaveBeenCalledWith("/events");
  });

  test("06.8 without a host's name or a limit, the roll is still full", async () => {
    mockPreview.mockImplementation(() => previewed({ state: "EVENT_MEMBER_LIMIT_REACHED", host: null }));
    await renderScreen();
    expect(await screen.findByText("This roll holds 30 people. Ask the host to make room.")).toBeOnTheScreen();
  });

  test("06.8 on a plan without a limit", async () => {
    mockPreview.mockImplementation(() => previewed({ state: "EVENT_MEMBER_LIMIT_REACHED", memberLimit: null }));
    await renderScreen();
    expect(await screen.findByText(/This roll/)).toBeOnTheScreen();
    expect(screen.getByText("Ask the host to make room.")).toBeOnTheScreen();
  });

  test("06.9 an envelope that doesn't open, whatever was wrong with it", async () => {
    mockPreview.mockImplementation(() => refused(404, "NOT_FOUND"));
    await renderScreen();

    expect(await screen.findByText(/This envelope/)).toBeOnTheScreen();
    expect(
      screen.getByText("It may have been reset or mistyped. Ask whoever sent it for a new one."),
    ).toBeOnTheScreen();
    expect(stampText("Not valid")).toBeOnTheScreen();
    expect(screen.getByRole("header", { name: "Envelope" })).toBeOnTheScreen();
    expect(screen.getAllByText("— — —")).toHaveLength(4);

    await press("Scan another");
    expect(mockRouter.replace).toHaveBeenCalledWith("/join");
  });

  test("06.10 removed by a host", async () => {
    mockPreview.mockImplementation(() => previewed({ state: "REMOVED_FROM_EVENT" }));
    await renderScreen();

    expect(await screen.findByText(/You were removed/)).toBeOnTheScreen();
    expect(
      screen.getByText("A host removed you, so this envelope doesn’t admit you. Only a host can let you back in."),
    ).toBeOnTheScreen();
    expect(stampText("Removed")).toBeOnTheScreen();
  });

  test("06.11 the roll has closed, with the day its photos went", async () => {
    mockPreview.mockImplementation(() => previewed({ state: "EVENT_GALLERY_CLOSED", galleryState: "CLOSED" }));
    await renderScreen();

    expect(await screen.findByText("The gallery closed on 17 Nov and its photos were removed.")).toBeOnTheScreen();
    expect(stampText("Closed")).toBeOnTheScreen();
  });

  test("06.11 closed without a date", async () => {
    mockPreview.mockImplementation(() => previewed({ state: "EVENT_GALLERY_CLOSED", galleryClosesAt: null }));
    await renderScreen();
    expect(await screen.findByText("The gallery has closed and its photos were removed.")).toBeOnTheScreen();
  });

  test("06.12 joining is on hold while Everglow reviews the roll", async () => {
    mockPreview.mockImplementation(() => previewed({ state: "EVENT_UNDER_REVIEW" }));
    await renderScreen();

    expect(await screen.findByText(/Joining is/)).toBeOnTheScreen();
    expect(screen.getByText("Everglow is reviewing this roll. Try the envelope again later.")).toBeOnTheScreen();
    expect(stampText("On hold")).toBeOnTheScreen();
    expect(stampText("Review")).toBeOnTheScreen();
  });

  test("a suspended roll says so plainly", async () => {
    mockPreview.mockImplementation(() => previewed({ state: "EVENT_SUSPENDED" }));
    await renderScreen();

    expect(
      await screen.findByText("Everglow suspended it for breaking our terms, so no one can join it."),
    ).toBeOnTheScreen();
  });

  describe("06.13 You blocked the host", () => {
    beforeEach(() => {
      mockPreview.mockImplementation(() =>
        previewed({ state: "ORGANIZER_BLOCKED_BY_CALLER", host: { userId: "user-sam", name: "Sam Rivera" } }),
      );
    });

    test("explains, and unblocks the host then joins", async () => {
      await renderScreen();

      expect(await screen.findByText(/You blocked Sam\./)).toBeOnTheScreen();
      expect(screen.getByText("To join, unblock Sam first. They won’t be told either way.")).toBeOnTheScreen();

      await press("Unblock Sam and join");

      await waitFor(() =>
        expect(mockRouter.replace).toHaveBeenCalledWith({
          pathname: "/events/[id]",
          params: { id: "roll-1", arrival: "joined", place: "25" },
        }),
      );
      expect(mockUnblock).toHaveBeenCalledWith({ path: { userId: "user-sam" }, throwOnError: true });
      expect(mockUnblock.mock.invocationCallOrder[0]).toBeLessThan(mockJoin.mock.invocationCallOrder[0]);
    });

    test("doesn't join when the unblock fails", async () => {
      mockUnblock.mockImplementation(() => refused(429, "RATE_LIMIT_EXCEEDED"));
      await renderScreen();
      await screen.findByText(/You blocked Sam\./);

      await press("Unblock Sam and join");

      await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith("Couldn’t unblock", expect.any(String)));
      expect(mockJoin).not.toHaveBeenCalled();
    });

    test("Not now goes back to the rolls", async () => {
      await renderScreen();
      await screen.findByText(/You blocked Sam\./);

      await press("Not now");

      expect(mockRouter.dismissTo).toHaveBeenCalledWith("/events");
      expect(mockUnblock).not.toHaveBeenCalled();
    });
  });
});

describe("When it can't open", () => {
  test("says so and tries again", async () => {
    mockPreview.mockImplementation(() => refused(429, "RATE_LIMIT_EXCEEDED"));
    await renderScreen();

    expect(await screen.findByText(/Couldn’t open/)).toBeOnTheScreen();
    mockPreview.mockImplementation(() => previewed());
    await press("Try again");

    expect(await screen.findByText("Sam & Jo’s wedding")).toBeOnTheScreen();
  });
});

describe("Leaving", () => {
  test("goes back the way they came", async () => {
    await renderScreen();
    await press("Back");
    expect(mockRouter.back).toHaveBeenCalled();
  });

  test("goes to the rolls when a link opened the app", async () => {
    mockRouter.canGoBack.mockReturnValue(false);
    await renderScreen();
    await press("Back");
    expect(mockRouter.dismissTo).toHaveBeenCalledWith("/events");
  });
});
