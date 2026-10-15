import { act, renderHook, waitFor } from "@testing-library/react-native";
import { AccessibilityInfo } from "react-native";
import { useReduceMotion } from "./use-reduce-motion";

test("reads the system setting and follows changes", async () => {
  let listener: (enabled: boolean) => void = () => undefined;
  jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(true);
  jest.spyOn(AccessibilityInfo, "addEventListener").mockImplementation((_event, handler) => {
    listener = handler as unknown as (enabled: boolean) => void;
    return { remove: jest.fn() } as unknown as ReturnType<typeof AccessibilityInfo.addEventListener>;
  });

  const { result } = await renderHook(() => useReduceMotion());
  await waitFor(() => expect(result.current).toBe(true));

  await act(async () => listener(false));
  expect(result.current).toBe(false);
});
