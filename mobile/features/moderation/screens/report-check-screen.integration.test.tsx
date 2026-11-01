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
  reportsControllerListReports: (...args: unknown[]) => mockListReports(...args),
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

beforeEach(() => {
  jest.clearAllMocks();
  mockParams.mockReturnValue({ id: "event-1", photoId: "photo-144" });
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
    params: { id: "event-1", photoId: "photo-144" },
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
  mockResolve.mockRejectedValue(new Error("Offline"));
  await renderWithClient(<ReportCheckScreen />);

  await userEvent.setup().press(await screen.findByRole("button", { name: "Remove the frame" }));

  expect(await screen.findByRole("alert")).toBeOnTheScreen();
  expect(mockRouter.back).not.toHaveBeenCalled();
});

test("a decision someone else already made just goes back", async () => {
  mockListReports.mockImplementation(() => listed([report()]));
  mockResolve.mockRejectedValue(createApiError("Already", { status: 409, code: "REPORT_ALREADY_RESOLVED" }));
  await renderWithClient(<ReportCheckScreen />);

  await userEvent.setup().press(await screen.findByRole("button", { name: "Remove the frame" }));

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
