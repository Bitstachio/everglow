// Integration tests compose the real screen with its data hooks.
// eslint-disable-next-line no-restricted-imports
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderWithI18n } from "@/testing/render";
import { createApiError } from "@/lib/api/errors";
import { screen, userEvent, waitFor } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { buildEvent, buildParticipant, buildPhoto } from "@/features/events/testing/fixtures";
import ReportScreen from "./report-screen";

const mockParams = jest.fn();
const mockRouter = { back: jest.fn(), canGoBack: () => true, replace: jest.fn(), dismissTo: jest.fn() };
const mockReportPhoto = jest.fn();
const mockReportMember = jest.fn();
const mockReportEvent = jest.fn();
const mockEvent = buildEvent({ id: "event-1", title: "Sam & Jo’s wedding" });
const mockParticipants = [
  buildParticipant({ userId: "u-host", name: "Sam Rivera", username: "sam" }),
  buildParticipant({ userId: "u-leila", name: "Leila Haddad", username: "leila.h", accessLevel: "PARTICIPANT" }),
];
const mockPhoto = buildPhoto({ id: "photo-144", addedById: "u-leila" });

jest.mock("@/lib/api/generated/client.gen", () => ({ client: { getConfig: () => ({}) } }));
jest.mock("@/lib/api/generated", () => ({
  eventsControllerFindOne: () => Promise.resolve({ data: { data: mockEvent, meta: {} } }),
  eventsControllerGetParticipants: () => Promise.resolve({ data: { data: mockParticipants, meta: {} } }),
  photosControllerFindOne: () => Promise.resolve({ data: { data: mockPhoto, meta: {} } }),
  reportsControllerReportPhoto: (...args: unknown[]) => mockReportPhoto(...args),
  reportsControllerReportMember: (...args: unknown[]) => mockReportMember(...args),
  reportsControllerReportEvent: (...args: unknown[]) => mockReportEvent(...args),
}));
jest.mock("expo-router", () => ({
  get router() {
    return mockRouter;
  },
  useLocalSearchParams: () => mockParams(),
}));

const initialMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const filed = () => Promise.resolve({ data: { data: { id: "report-1" }, meta: {} } });

const renderScreen = () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false, gcTime: 0 } },
  });
  return renderWithI18n(
    <SafeAreaProvider initialMetrics={initialMetrics}>
      <QueryClientProvider client={client}>
        <ReportScreen />
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
};

beforeEach(() => {
  jest.clearAllMocks();
  mockReportPhoto.mockImplementation(filed);
  mockReportMember.mockImplementation(filed);
  mockReportEvent.mockImplementation(filed);
});

describe("a frame (10.1–10.4)", () => {
  beforeEach(() => mockParams.mockReturnValue({ id: "event-1", photoId: "photo-144", number: "144" }));

  test("sends nothing until a reason is ticked, then sends it and lands on the roll", async () => {
    await renderScreen();
    expect(screen.getByRole("header", { name: "Report frame 144" })).toBeOnTheScreen();
    expect(await screen.findByLabelText("▸ 144 · Leila Haddad")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Send report" })).toBeDisabled();

    const user = userEvent.setup();
    await user.press(screen.getByRole("checkbox", { name: "Harassment" }));
    expect(screen.getByRole("checkbox", { name: "Harassment" })).toBeChecked();
    await user.press(screen.getByRole("button", { name: "Send report" }));

    await waitFor(() =>
      expect(mockRouter.dismissTo).toHaveBeenCalledWith({
        pathname: "/events/[id]",
        params: { id: "event-1", reported: "frame" },
      }),
    );
    expect(mockReportPhoto).toHaveBeenCalledWith(
      expect.objectContaining({ path: { photoId: "photo-144" }, body: { reason: "HARASSMENT" } }),
    );
  });

  test("a serious reason goes only to Everglow, and the ticket says where to get help (10.3)", async () => {
    await renderScreen();
    await user().press(screen.getByRole("checkbox", { name: "A child is at risk" }));

    expect(screen.getByText(/only to Everglow’s safety team/)).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Send to Everglow" })).toBeEnabled();
  });

  test("Something else opens a short note that goes with the report (10.2)", async () => {
    await renderScreen();
    const typing = user();
    await typing.press(screen.getByRole("checkbox", { name: "Something else" }));
    await typing.paste(screen.getByLabelText("A short note about what’s wrong, optional"), "  Not from this party  ");
    await typing.press(screen.getByRole("button", { name: "Send report" }));

    await waitFor(() =>
      expect(mockReportPhoto).toHaveBeenCalledWith(
        expect.objectContaining({ body: { reason: "OTHER", note: "Not from this party" } }),
      ),
    );
  });

  test("a frame gone since the menu opened says so and keeps the ticket", async () => {
    mockReportPhoto.mockRejectedValue(createApiError("Not found", { status: 404 }));
    await renderScreen();
    await user().press(screen.getByRole("checkbox", { name: "Spam" }));
    await user().press(screen.getByRole("button", { name: "Send report" }));

    expect(await screen.findByText("This frame isn’t on the roll anymore.")).toBeOnTheScreen();
    expect(screen.getByRole("checkbox", { name: "Spam" })).toBeChecked();
    expect(mockRouter.dismissTo).not.toHaveBeenCalled();
  });

  test("closing goes back to the frame it came from", async () => {
    await renderScreen();
    await user().press(screen.getByRole("button", { name: "Close" }));

    expect(mockRouter.dismissTo).toHaveBeenCalledWith({
      pathname: "/events/[id]",
      params: { id: "event-1", resume: "photo-144" },
    });
  });
});

test("a person has their own reasons, and no intimate-image reason (10.5)", async () => {
  mockParams.mockReturnValue({ id: "event-1", userId: "u-leila" });
  await renderScreen();

  expect(await screen.findByRole("header", { name: "Report Leila Haddad" })).toBeOnTheScreen();
  expect(screen.getByRole("checkbox", { name: "Harassing people" })).toBeOnTheScreen();
  expect(screen.queryByRole("checkbox", { name: /intimate/i })).not.toBeOnTheScreen();

  await user().press(screen.getByRole("checkbox", { name: "Violence or threats" }));
  await user().press(screen.getByRole("button", { name: "Send report" }));
  await waitFor(() =>
    expect(mockReportMember).toHaveBeenCalledWith(
      expect.objectContaining({ path: { eventId: "event-1", targetUserId: "u-leila" }, body: { reason: "VIOLENCE" } }),
    ),
  );
});

test("the whole roll goes to Everglow (10.6)", async () => {
  mockParams.mockReturnValue({ id: "event-1" });
  await renderScreen();

  expect(await screen.findByRole("header", { name: "Report Sam & Jo’s wedding" })).toBeOnTheScreen();
  expect(screen.getByText(/Reports about a roll go to Everglow/)).toBeOnTheScreen();
  await user().press(screen.getByRole("checkbox", { name: "Spam or a scam" }));
  await user().press(screen.getByRole("button", { name: "Send report" }));

  await waitFor(() =>
    expect(mockRouter.dismissTo).toHaveBeenCalledWith({
      pathname: "/events/[id]",
      params: { id: "event-1", reported: "roll" },
    }),
  );
  expect(mockReportEvent).toHaveBeenCalledWith(expect.objectContaining({ path: { eventId: "event-1" } }));
});

const user = () => userEvent.setup();
