import { I18nProvider } from "@/providers/i18n-provider";
import { act, renderHook } from "@testing-library/react-native";
import { Alert } from "react-native";
import { useDeleteAccountScreen } from "./use-delete-account-screen";

const mockDelete = jest.fn();
const mockLogout = jest.fn();
let mockSuspended = false;
jest.mock("@/context/auth-context", () => ({
  useAuth: () => ({ user: { id: "me" }, isSuspended: mockSuspended, logout: mockLogout }),
}));
jest.mock("../api/mutations", () => ({
  useDeleteProfileMutation: () => ({ mutateAsync: mockDelete }),
}));
const event = (id: string, title: string, creatorId: string | null, members: number) => ({
  id,
  title,
  creatorId,
  usage: { members, storageBytes: "0" },
});
const mockEventsQuery = jest.fn();
const mockRefetch = jest.fn();
let mockEvents: { data?: unknown[]; isError: boolean } = { isError: false };
jest.mock("@/features/events/api/queries", () => ({
  useEventsQuery: (userId: string | undefined) => {
    mockEventsQuery(userId);
    return { ...mockEvents, refetch: mockRefetch };
  },
}));
const mockReplace = jest.fn();
let mockCanGoBack = true;
jest.mock("expo-router", () => ({
  router: { back: jest.fn(), canGoBack: () => mockCanGoBack, replace: (href: string) => mockReplace(href) },
}));

const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
const render = () => renderHook(() => useDeleteAccountScreen(), { wrapper: I18nProvider });

beforeEach(() => {
  jest.clearAllMocks();
  mockSuspended = false;
  mockCanGoBack = true;
  mockEvents = {
    isError: false,
    data: [
      event("e1", "Nadia turns 30", "me", 6),
      event("e2", "Picnic, just me", "me", 1),
      event("e3", "Sam & Jo’s wedding", "sam", 40),
      event("e4", "Left alone", null, 1),
    ],
  };
  mockDelete.mockResolvedValue(undefined);
  mockLogout.mockResolvedValue(undefined);
});

test("lists the rolls you started or are alone on, and what happens to each", async () => {
  const { result } = await render();
  expect(mockEventsQuery).toHaveBeenCalledWith("me");
  expect(result.current.showRolls).toBe(true);
  expect(result.current.rolls).toEqual([
    { id: "e1", title: "Nadia turns 30", fate: "stays" },
    { id: "e2", title: "Picnic, just me", fate: "deleted" },
    { id: "e4", title: "Left alone", fate: "deleted" },
  ]);
});

test("leaves the rolls out when none are yours or yours alone", async () => {
  mockEvents = { isError: false, data: [event("e3", "Sam & Jo’s wedding", "sam", 40)] };
  const { result } = await render();
  expect(result.current.showRolls).toBe(false);
});

test("says when the rolls couldn't load, and tries again", async () => {
  mockEvents = { isError: true };
  const { result } = await render();
  expect(result.current).toMatchObject({ showRolls: true, rollsFailed: true, rolls: [] });
  result.current.onRetryRolls();
  expect(mockRefetch).toHaveBeenCalledTimes(1);
});

test("a suspended account doesn't ask for its rolls, which the API refuses", async () => {
  mockSuspended = true;
  mockEvents = { isError: false };
  mockCanGoBack = false;
  const { result } = await render();
  expect(mockEventsQuery).toHaveBeenCalledWith(undefined);
  expect(result.current.showRolls).toBe(true);
  result.current.onBack();
  expect(mockReplace).toHaveBeenCalledWith("/account-suspended");
});

test("nothing is deleted until a photos choice is made", async () => {
  const { result } = await render();
  await act(() => result.current.onDelete());
  expect(mockDelete).not.toHaveBeenCalled();
});

test.each(["KEEP", "DELETE"] as const)("deletes with %s, then signs out onto Deleted", async (choice) => {
  const { result } = await render();
  await act(() => result.current.onChoosePhotos(choice));
  await act(async () => {
    result.current.onDelete();
  });
  expect(mockDelete).toHaveBeenCalledWith(choice);
  expect(mockLogout).toHaveBeenCalledWith("/account-deleted");
});

test("a failed delete says so, stays signed in and can be tried again", async () => {
  mockDelete.mockRejectedValueOnce(new Error("Offline"));
  const { result } = await render();
  await act(() => result.current.onChoosePhotos("KEEP"));
  await act(async () => {
    result.current.onDelete();
  });
  expect(alert).toHaveBeenCalledWith("Couldn’t delete your account", expect.any(String));
  expect(mockLogout).not.toHaveBeenCalled();
  expect(result.current.isDeleting).toBe(false);

  await act(async () => {
    result.current.onDelete();
  });
  expect(mockDelete).toHaveBeenCalledTimes(2);
  expect(mockLogout).toHaveBeenCalledTimes(1);
});

test("a second tap while deleting is ignored", async () => {
  let finish!: () => void;
  mockDelete.mockReturnValue(new Promise<void>((resolve) => (finish = resolve)));
  const { result } = await render();
  await act(() => result.current.onChoosePhotos("DELETE"));
  await act(async () => {
    result.current.onDelete();
    result.current.onDelete();
  });
  expect(mockDelete).toHaveBeenCalledTimes(1);
  await act(async () => finish());
});

test("stays deleting while Auth0 clears the session, so the leader can't be pressed again", async () => {
  mockLogout.mockReturnValue(new Promise<void>(() => {}));
  const { result } = await render();
  await act(() => result.current.onChoosePhotos("KEEP"));
  await act(async () => {
    result.current.onDelete();
  });
  expect(mockLogout).toHaveBeenCalledTimes(1);
  expect(result.current.isDeleting).toBe(true);

  await act(async () => {
    result.current.onDelete();
  });
  expect(mockDelete).toHaveBeenCalledTimes(1);
});
