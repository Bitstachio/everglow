import { act, renderHook } from "@testing-library/react-native";
import { useInput } from "./use-input";

test("hides the toggle when the field is not secure", async () => {
  const { result } = await renderHook(() => useInput({}));
  expect(result.current.showToggle).toBe(false);
  expect(result.current.isSecure).toBe(false);
});

test("toggles secure entry and accessibility labels", async () => {
  const { result } = await renderHook(() => useInput({ secureTextEntry: true }));
  expect(result.current.showToggle).toBe(true);
  expect(result.current.isSecure).toBe(true);
  expect(result.current.toggleAccessibilityLabel).toBe("Show password");
  expect(result.current.toggleIconName).toBe("eye-outline");

  await act(async () => {
    result.current.onTogglePasswordVisibility();
  });
  expect(result.current.isSecure).toBe(false);
  expect(result.current.toggleAccessibilityLabel).toBe("Hide password");
  expect(result.current.toggleIconName).toBe("eye-off-outline");
});

test("reports disabled from editable=false", async () => {
  const { result } = await renderHook(() => useInput({ editable: false }));
  expect(result.current.isDisabled).toBe(true);
});
