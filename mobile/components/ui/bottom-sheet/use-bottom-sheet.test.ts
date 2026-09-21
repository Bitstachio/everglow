import { act, renderHook } from "@testing-library/react-native";
import { Animated } from "react-native";
import { useBottomSheetPresentation } from "./use-bottom-sheet";

type StartCallback = (result: { finished: boolean }) => void;

let lastStartCallback: StartCallback | null;

beforeEach(() => {
  lastStartCallback = null;
  jest.spyOn(Animated, "parallel").mockImplementation(
    () =>
      ({
        start: (callback?: StartCallback) => {
          lastStartCallback = callback ?? null;
        },
        stop: jest.fn(),
      }) as unknown as Animated.CompositeAnimation,
  );
});

afterEach(() => {
  jest.restoreAllMocks();
});

test("starts hidden when not visible", async () => {
  const { result } = await renderHook(() => useBottomSheetPresentation(false));
  expect(result.current.presented).toBe(false);
  expect(result.current.pointerEvents).toBe("none");
});

test("presents and accepts pointer events when visible", async () => {
  const { result } = await renderHook(() => useBottomSheetPresentation(true));
  expect(result.current.presented).toBe(true);
  expect(result.current.pointerEvents).toBe("auto");
});

test("keeps presented through close until the exit animation finishes", async () => {
  const { result, rerender } = await renderHook(
    ({ visible }: { visible: boolean }) => useBottomSheetPresentation(visible),
    { initialProps: { visible: true } },
  );

  await act(async () => {
    rerender({ visible: false });
  });
  expect(result.current.presented).toBe(true);
  expect(result.current.pointerEvents).toBe("none");
  expect(lastStartCallback).toEqual(expect.any(Function));

  await act(async () => {
    lastStartCallback?.({ finished: true });
  });
  expect(result.current.presented).toBe(false);
});

test("does not unpresent when reopened before close finishes", async () => {
  const { result, rerender } = await renderHook(
    ({ visible }: { visible: boolean }) => useBottomSheetPresentation(visible),
    { initialProps: { visible: true } },
  );

  await act(async () => {
    rerender({ visible: false });
  });
  const closeCallback = lastStartCallback;

  await act(async () => {
    rerender({ visible: true });
  });
  expect(result.current.presented).toBe(true);
  expect(result.current.pointerEvents).toBe("auto");

  await act(async () => {
    closeCallback?.({ finished: true });
  });
  expect(result.current.presented).toBe(true);
});
