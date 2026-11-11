// Integration tests compose the real screens with their data hooks.
// eslint-disable-next-line no-restricted-imports
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderWithI18n } from "@/testing/render";
import { createApiError } from "@/lib/api/errors";
import { screen, userEvent, waitFor } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { buildEvent, buildParticipant, buildPhoto } from "@/features/events/testing/fixtures";
import type { ReportResponseDto } from "../types";
import ReportCheckScreen from "./report-check-screen";
import ReportsScreen from "./reports-screen";

const mockParams = jest.fn();
const mockRouter = { back: jest.fn(), canGoBack: () => true, replace: jest.fn(), push: jest.fn() };
const mockListReports = jest.fn();
const mockResolve = jest.fn();
const mockEvent = buildEvent({ id: "event-1", title: "Sam & Jo’s wedding" });
const mockParticipants = [
  buildParticipant({ userId: "u-host", name: "Sam Rivera", username: "sam" }),
  buildParticipant({ userId: "u-marcus", name: "Marcus Bell", username: "marcus", accessLevel: "PARTICIPANT" }),
];
// Newest first: photo-144 is the roll's 2nd frame.
const mockPhotos = [
  buildPhoto({ id: "photo-144", addedById: "u-marcus" }),
  buildPhoto({ id: "photo-1", addedById: "u-host" }),
];

jest.mock("@/lib/api/generated/client.gen", () => ({ client: { getConfig: () => ({}) } }));
jest.mock("@/lib/api/generated", () => ({
  eventsControllerFindOne: () => Promise.resolve({ data: { data: mockEvent, meta: {} } }),
  eventsControllerGetParticipants: () => Promise.resolve({ data: { data: mockParticipants, meta: {} } }),
  photosControllerListPhotos: () =>
    Promise.resolve({ data: { data: { items: mockPhotos, nextCursor: null }, meta: {} } }),
  // The API filters by `status`; the mock does the same with whatever the test listed.
  reportsControllerListReports: async (options: { query?: { status?: string } }) => {
    const response = await mockListReports(options);
    const status = options.query?.status;
    if (!status) return response;
    const page = response.data.data;
    return {
      ...response,
      data: {
        ...response.data,
        data: { ...page, items: page.items.filter((item: ReportResponseDto) => item.status === status) },
      },
    };
  },
  reportsControllerResolveReport: (...args: unknown[]) => mockResolve(...args),
}));
jest.mock("@/context/auth-context", () => ({ useAuth: () => ({ user: { id: "u-host" } }) }));
// Read on each call: jest hoists this factory above mockRouter's definition.
jest.mock("expo-router", () => ({
  router: new Proxy({}, { get: (_target, key: keyof typeof mockRouter) => mockRouter[key] }),
  useLocalSearchParams: () => mockParams(),
}));

const initialMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

let next = 0;
const report = (overrides: Partial<ReportResponseDto> = {}): ReportResponseDto => ({
  id: `report-${++next}`,
  eventId: "event-1",
  eventTitle: "Sam & Jo’s wedding",
  source: "USER",
  targetType: "PHOTO",
  photoId: "photo-144",
  reportedUserId: "u-marcus",
  reason: "NUDITY_OR_SEXUAL",
  note: null,
  status: "OPEN",
  queue: "ORGANIZERS",
  closedReason: null,
  closedByRole: null,
  resolvedById: null,
  resolvedAt: null,
  createdAt: "2026-10-30T10:00:00.000Z",
  ...overrides,
});
const listed = (items: ReportResponseDto[]) =>
  Promise.resolve({ data: { data: { items, nextCursor: null }, meta: {} } });

const renderWithClient = (ui: React.ReactElement) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false, gcTime: 0 } },
  });
  return renderWithI18n(
    <SafeAreaProvider initialMetrics={initialMetrics}>
      <QueryClientProvider client={client}>{ui}</QueryClientProvider>
    </SafeAreaProvider>,
  );
};

/** 10.9 Remove the frame, then confirm on the delete slip. */
const removeTheFrame = async () => {
  const user = userEvent.setup();
  await user.press(await screen.findByRole("button", { name: "Remove the frame" }));
  await user.press(await screen.findByRole("button", { name: "Delete it" }));
};

beforeEach(() => {
  jest.clearAllMocks();
  mockParticipants[1] = { ...mockParticipants[1], photoCount: 0 };
  mockParams.mockReturnValue({ id: "event-1", key: "frame:photo-144" });
  mockResolve.mockResolvedValue({ data: { data: report({ status: "ACTIONED" }), meta: {} } });
});

test("10.8 lists one ticket per frame with its reasons, never who reported it", async () => {
  mockParams.mockReturnValue({ id: "event-1" });
  mockListReports.mockImplementation(() =>
    listed([
      report(),
      report(),
      report({ reason: "SPAM" }),
      report({ targetType: "MEMBER", photoId: null, reason: "HARASSMENT" }),
      report({ status: "DISMISSED", resolvedAt: new Date().toISOString() }),
    ]),
  );
  await renderWithClient(<ReportsScreen />);

  expect(await screen.findByRole("header", { name: "Reports · 2 to check" })).toBeOnTheScreen();
  expect(screen.getByRole("button", { name: "Frame 2 · by Marcus, 3 reports · nudity · hidden" })).toBeOnTheScreen();
  expect(screen.getByRole("button", { name: "Marcus Bell, 1 report · harassment" })).toBeOnTheScreen();
  expect(screen.getByText("Done · 1 this week")).toBeOnTheScreen();

  await userEvent.setup().press(screen.getByRole("button", { name: /Frame 2/ }));
  expect(mockRouter.push).toHaveBeenCalledWith({
    pathname: "/events/[id]/report-check",
    params: { id: "event-1", key: "frame:photo-144" },
  });
});

test("10.9 one decision closes the frame's reports, then goes back to the list", async () => {
  mockListReports.mockImplementation(() => listed([report(), report({ reason: "SPAM" })]));
  await renderWithClient(<ReportCheckScreen />);

  expect(await screen.findByRole("header", { name: "Frame 2 · 2 reports" })).toBeOnTheScreen();
  expect(screen.getByText("Nudity · 1")).toBeOnTheScreen();
  expect(screen.getByRole("button", { name: "Remove Marcus from the roll" })).toBeOnTheScreen();

  await userEvent.setup().press(screen.getByRole("button", { name: "Keep it, it’s fine" }));

  await waitFor(() => expect(mockRouter.back).toHaveBeenCalled());
  expect(mockResolve).toHaveBeenCalledWith(
    expect.objectContaining({ path: { reportId: expect.any(String) }, body: { action: "DISMISS" } }),
  );
});

test("a failed decision says so and stays", async () => {
  mockListReports.mockImplementation(() => listed([report()]));
  mockResolve.mockRejectedValue(createApiError("Network error. Please check your connection."));
  await renderWithClient(<ReportCheckScreen />);

  await removeTheFrame();

  expect(await screen.findByRole("alert")).toBeOnTheScreen();
  expect(mockRouter.back).not.toHaveBeenCalled();
});

test("a decision someone else already made just goes back", async () => {
  mockListReports.mockImplementation(() => listed([report()]));
  mockResolve.mockRejectedValue(createApiError("Already", { status: 409, code: "REPORT_ALREADY_RESOLVED" }));
  await renderWithClient(<ReportCheckScreen />);

  await removeTheFrame();

  await waitFor(() => expect(mockRouter.back).toHaveBeenCalled());
});

test("10.10 a frame with Everglow tells hosts no more than that", async () => {
  mockListReports.mockImplementation(() => listed([report({ queue: "PLATFORM" })]));
  await renderWithClient(<ReportCheckScreen />);

  expect(await screen.findByRole("header", { name: "Frame 2 · reported" })).toBeOnTheScreen();
  expect(screen.getByText(/Everglow’s safety team/)).toBeOnTheScreen();
  expect(screen.queryByRole("button", { name: "Remove the frame" })).not.toBeOnTheScreen();
  await userEvent.setup().press(screen.getByRole("button", { name: "Ok" }));
  expect(mockRouter.back).toHaveBeenCalled();
});

test("10.8 counts only what hosts can decide, and names someone who left", async () => {
  mockParams.mockReturnValue({ id: "event-1" });
  mockListReports.mockImplementation(() =>
    listed([
      report({ queue: "PLATFORM" }),
      report({ targetType: "MEMBER", photoId: null, reportedUserId: "u-gone", reason: "SPAM" }),
    ]),
  );
  await renderWithClient(<ReportsScreen />);

  expect(await screen.findByRole("header", { name: "Reports · 1 to check" })).toBeOnTheScreen();
  expect(
    screen.getByRole("button", { name: "Frame 2 · by Marcus, 1 report · nudity · with Everglow" }),
  ).toBeOnTheScreen();
  expect(screen.getByRole("button", { name: "Someone who left, 1 report · spam" })).toBeOnTheScreen();
});

test("a frame Everglow's check flagged says so in the list, and is with Everglow", async () => {
  mockParams.mockReturnValue({ id: "event-1" });
  mockListReports.mockImplementation(() =>
    listed([report({ source: "AUTOMATED", queue: "PLATFORM", reason: "HARASSMENT", note: "Upload screening" })]),
  );
  await renderWithClient(<ReportsScreen />);

  expect(
    await screen.findByRole("button", {
      name: "Frame 2 · by Marcus, 1 report · harassment · flagged automatically · with Everglow",
    }),
  ).toBeOnTheScreen();
  expect(screen.queryByText(/Upload screening/)).not.toBeOnTheScreen();
});

test("the decision shows hosts what people wrote, never an automated report's readout", async () => {
  mockListReports.mockImplementation(() =>
    listed([
      report({ reason: "SPAM", note: "Not from this party" }),
      report({
        source: "AUTOMATED",
        queue: "PLATFORM",
        reason: "NUDITY_OR_SEXUAL",
        note: "Upload screening: Explicit",
      }),
    ]),
  );
  await renderWithClient(<ReportCheckScreen />);

  expect(await screen.findByText(/Not from this party/)).toBeOnTheScreen();
  expect(screen.queryByText(/Upload screening/)).not.toBeOnTheScreen();
});

test("10.8 a host-only list that fails to load says why, and tries again", async () => {
  mockParams.mockReturnValue({ id: "event-1" });
  mockListReports.mockRejectedValueOnce(createApiError("Only hosts", { status: 403, code: "ORGANIZER_ONLY" }));
  mockListReports.mockImplementation(() => listed([]));
  await renderWithClient(<ReportsScreen />);

  expect(await screen.findByText("Only hosts can do that.")).toBeOnTheScreen();
  await userEvent.setup().press(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByRole("header", { name: "Nothing to check on your roll." })).toBeOnTheScreen();
});

test("10.9 a report the host filed is decided through another one on the frame", async () => {
  const own = report();
  const other = report();
  mockListReports.mockImplementation(() => listed([own, other]));
  mockResolve
    .mockRejectedValueOnce(createApiError("Own", { status: 403, code: "CANNOT_RESOLVE_OWN_REPORT" }))
    .mockResolvedValueOnce({ data: { data: report({ status: "ACTIONED" }), meta: {} } });
  await renderWithClient(<ReportCheckScreen />);

  await removeTheFrame();

  await waitFor(() => expect(mockRouter.back).toHaveBeenCalled());
  expect(mockResolve.mock.calls.map(([options]) => options.path.reportId)).toEqual([own.id, other.id]);
});

test("10.9 a frame no longer on the roll can only be kept", async () => {
  mockParams.mockReturnValue({ id: "event-1", key: "frame:photo-deleted" });
  mockListReports.mockImplementation(() => listed([report({ photoId: "photo-deleted", reason: "SPAM" })]));
  await renderWithClient(<ReportCheckScreen />);

  expect(await screen.findByText("Deleted")).toBeOnTheScreen();
  expect(screen.queryByRole("button", { name: "Remove the frame" })).not.toBeOnTheScreen();
  expect(screen.getByRole("button", { name: "Keep it, it’s fine" })).toBeOnTheScreen();
});

test("10.9 a report that can't load isn't called handled", async () => {
  mockListReports.mockRejectedValue(createApiError("Network error. Please check your connection."));
  await renderWithClient(<ReportCheckScreen />);

  expect(await screen.findByText("Network error. Please check your connection.")).toBeOnTheScreen();
  expect(screen.queryByText("Already handled.")).not.toBeOnTheScreen();
  expect(screen.queryByRole("button", { name: "Keep it, it’s fine" })).not.toBeOnTheScreen();
});

test("10.9 a decision made elsewhere leaves nothing to do here", async () => {
  mockListReports.mockImplementation(() =>
    listed([report({ status: "ACTIONED", resolvedAt: new Date().toISOString() })]),
  );
  await renderWithClient(<ReportCheckScreen />);

  expect(await screen.findByText("Already handled.")).toBeOnTheScreen();
  await userEvent.setup().press(screen.getByRole("button", { name: "Ok" }));
  expect(mockRouter.back).toHaveBeenCalled();
});

test("10.9 removing the frame waits for the confirm", async () => {
  mockListReports.mockImplementation(() => listed([report({ reason: "SPAM" })]));
  await renderWithClient(<ReportCheckScreen />);
  const user = userEvent.setup();

  await user.press(await screen.findByRole("button", { name: "Remove the frame" }));
  expect(await screen.findByRole("header", { name: "Delete this frame for everyone?" })).toBeOnTheScreen();
  expect(mockResolve).not.toHaveBeenCalled();

  await user.press(screen.getByRole("button", { name: "Keep it" }));
  expect(mockResolve).not.toHaveBeenCalled();
});

test("10.9 removing the person confirms on 11.4's slip and sends what happens to their frames", async () => {
  mockParticipants[1] = { ...mockParticipants[1], photoCount: 4 };
  mockListReports.mockImplementation(() => listed([report({ reason: "SPAM" })]));
  await renderWithClient(<ReportCheckScreen />);
  const user = userEvent.setup();

  await user.press(await screen.findByRole("button", { name: "Remove Marcus from the roll" }));
  expect(await screen.findByRole("header", { name: "What about their 3 other frames?" })).toBeOnTheScreen();
  expect(screen.getByText("The reported frame is removed either way.")).toBeOnTheScreen();
  expect(mockResolve).not.toHaveBeenCalled();

  await user.press(screen.getByRole("radio", { name: /Delete them too/ }));
  await user.press(screen.getByRole("button", { name: "Remove Marcus" }));

  await waitFor(() => expect(mockRouter.back).toHaveBeenCalled());
  expect(mockResolve).toHaveBeenCalledWith(
    expect.objectContaining({ body: { action: "REMOVE_MEMBER", photos: "DELETE" } }),
  );
});

test("10.9 Keep on a severe report says it goes to Everglow, not that it closes", async () => {
  mockListReports.mockImplementation(() => listed([report({ reason: "VIOLENCE" })]));
  await renderWithClient(<ReportCheckScreen />);

  expect(
    await screen.findByText("Keep hands this to Everglow’s safety team. The frame stays hidden until they decide."),
  ).toBeOnTheScreen();
});

test("10.9 Keep on an ordinary report has no note", async () => {
  mockListReports.mockImplementation(() => listed([report({ reason: "SPAM" })]));
  await renderWithClient(<ReportCheckScreen />);

  expect(await screen.findByRole("button", { name: "Keep it, it’s fine" })).toBeOnTheScreen();
  expect(screen.queryByText(/hands this to Everglow/)).not.toBeOnTheScreen();
});

test("10.8 reads every page of open reports, and only recent ones for Done", async () => {
  mockParams.mockReturnValue({ id: "event-1" });
  const pages = 7;
  mockListReports.mockImplementation(({ query }: { query: { status?: string; cursor?: string } }) => {
    if (query.status !== "OPEN") {
      return listed([report({ status: "ACTIONED", resolvedAt: new Date().toISOString() })]);
    }
    const page = Number(query.cursor ?? 0);
    return Promise.resolve({
      data: {
        data: {
          items: [report({ photoId: `photo-old-${page}`, reason: "SPAM" })],
          nextCursor: page + 1 < pages ? String(page + 1) : null,
        },
        meta: {},
      },
    });
  });
  await renderWithClient(<ReportsScreen />);

  expect(await screen.findByRole("header", { name: `Reports · ${pages} to check` })).toBeOnTheScreen();
  expect(screen.getByText("Done · 1 this week")).toBeOnTheScreen();
  const openCalls = mockListReports.mock.calls.filter(([options]) => options.query.status === "OPEN");
  expect(openCalls).toHaveLength(pages);
});
