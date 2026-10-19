import { act, renderHook } from "@testing-library/react-native";
import { useLeaveUnsaved } from "./use-leave-unsaved";

const mockDispatch = jest.fn();
let mockPrevent: { prevent: boolean; callback: (event: { data: { action: unknown } }) => void };

jest.mock("expo-router", () => ({ useNavigation: () => ({ dispatch: mockDispatch }) }));
jest.mock("expo-router/react-navigation", () => ({
  usePreventRemove: (prevent: boolean, callback: typeof mockPrevent.callback) => {
    mockPrevent = { prevent, callback };
  },
}));

const back = { type: "GO_BACK" };

/** What React Navigation does when the screen is about to go: ask the hook if it may. */
const leave = () =>
  act(() => {
    if (mockPrevent.prevent) mockPrevent.callback({ data: { action: back } });
    else mockDispatch(back);
  });

beforeEach(() => mockDispatch.mockReset());

test("lets an empty roll go without asking", async () => {
  const { result } = await renderHook(() => useLeaveUnsaved(false));
  await leave();
  expect(result.current.visible).toBe(false);
  expect(mockDispatch).toHaveBeenCalledWith(back);
});

test("asks before throwing a roll away, and keeps editing on request", async () => {
  const { result } = await renderHook(() => useLeaveUnsaved(true));
  await leave();
  expect(result.current.visible).toBe(true);
  expect(mockDispatch).not.toHaveBeenCalled();

  await act(() => result.current.onKeepEditing());
  expect(result.current.visible).toBe(false);
  expect(mockDispatch).not.toHaveBeenCalled();
});

test("throws the roll away by finishing the way the host was leaving", async () => {
  const { result } = await renderHook(() => useLeaveUnsaved(true));
  await leave();
  await act(() => result.current.onThrowAway());
  expect(result.current.visible).toBe(false);
  expect(mockDispatch).toHaveBeenCalledWith(back);
});

test("lets a loaded roll's screen go without asking", async () => {
  const { result } = await renderHook(() => useLeaveUnsaved(true));
  result.current.allowLeave();
  await leave();
  expect(result.current.visible).toBe(false);
  expect(mockDispatch).toHaveBeenCalledWith(back);
});
