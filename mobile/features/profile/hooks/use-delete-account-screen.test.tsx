import { I18nProvider } from "@/providers/i18n-provider";
import { act, renderHook } from "@testing-library/react-native";
import { Alert } from "react-native";
import { useDeleteAccountScreen } from "./use-delete-account-screen";

const mockDelete = jest.fn();
const mockLogout = jest.fn();
let mockPending = false;
jest.mock("@/context/auth-context", () => ({ useAuth: () => ({ user: { id: "me" }, logout: mockLogout }) }));
jest.mock("../api/mutations", () => ({
  useDeleteProfileMutation: () => ({ mutateAsync: mockDelete, isPending: mockPending }),
}));
const event = (id: string, title: string, creatorId: string | null, members: number) => ({
  id,
  title,
  creatorId,
  usage: { members, storageBytes: "0" },
});
jest.mock("@/features/events/api/queries", () => ({
  useEventsQuery: () => ({
    data: [
      event("e1", "Nadia turns 30", "me", 6),
      event("e2", "Picnic, just me", "me", 1),
      event("e3", "Sam & Jo’s wedding", "sam", 40),
      event("e4", "Left alone", null, 1),
    ],
  }),
}));
jest.mock("expo-router", () => ({ router: { back: jest.fn(), canGoBack: () => true, replace: jest.fn() } }));

const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
const render = () => renderHook(() => useDeleteAccountScreen(), { wrapper: I18nProvider });

beforeEach(() => {
  jest.clearAllMocks();
  mockPending = false;
  mockDelete.mockResolvedValue(undefined);
  mockLogout.mockResolvedValue(undefined);
});

test("lists the rolls you started or are alone on, and what happens to each", async () => {
  const { result } = await render();
  expect(result.current.rolls).toEqual([
    { id: "e1", title: "Nadia turns 30", fate: "stays" },
    { id: "e2", title: "Picnic, just me", fate: "deleted" },
    { id: "e4", title: "Left alone", fate: "deleted" },
  ]);
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

test("a failed delete says so and stays signed in", async () => {
  mockDelete.mockRejectedValue(new Error("Offline"));
  const { result } = await render();
  await act(() => result.current.onChoosePhotos("KEEP"));
  await act(async () => {
    result.current.onDelete();
  });
  expect(alert).toHaveBeenCalledWith("Couldn’t delete your account", expect.any(String));
  expect(mockLogout).not.toHaveBeenCalled();
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
