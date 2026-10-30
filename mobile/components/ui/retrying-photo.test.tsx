import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { RetryingPhoto } from "./retrying-photo";

test("uses the supplied image variant and stable cache identity", async () => {
  await render(<RetryingPhoto testID="preview" uri="https://bucket/thumb.webp" cacheKey="photo:1:thumbnail" />);
  expect(screen.getByTestId("preview").props.source).toEqual([
    {
      uri: "https://bucket/thumb.webp",
      cacheKey: "photo:1:thumbnail",
    },
  ]);
});

test("retries a missing image three times, then keeps the placeholder without switching sources", async () => {
  jest.useFakeTimers();
  const view = await render(
    <RetryingPhoto testID="preview" uri="https://bucket/thumb.webp" cacheKey="photo:1:thumbnail" />,
  );
  try {
    for (const delay of [2000, 5000, 10000]) {
      await fireEvent(screen.getByTestId("preview"), "error", { nativeEvent: { error: "not ready" } });
      expect(screen.queryByTestId("preview")).not.toBeOnTheScreen();
      await act(async () => {
        jest.advanceTimersByTime(delay);
      });
      expect(screen.getByTestId("preview").props.source[0].uri).toBe("https://bucket/thumb.webp");
    }
    await fireEvent(screen.getByTestId("preview"), "error", { nativeEvent: { error: "still missing" } });
    await act(async () => {
      jest.advanceTimersByTime(60000);
    });
    expect(screen.queryByTestId("preview")).not.toBeOnTheScreen();
    // A refreshed signature starts a fresh attempt for the same thumbnail identity.
    await view.rerender(
      <RetryingPhoto testID="preview" uri="https://bucket/thumb.webp?refreshed" cacheKey="photo:1:thumbnail" />,
    );
    expect(screen.getByTestId("preview").props.source[0].uri).toBe("https://bucket/thumb.webp?refreshed");
  } finally {
    await view.unmount();
    jest.useRealTimers();
  }
});

test("cancels a pending retry when its frame unmounts", async () => {
  jest.useFakeTimers();
  const view = await render(<RetryingPhoto testID="preview" uri="https://bucket/thumb.webp" />);
  const schedule = jest.spyOn(globalThis, "setTimeout");
  const cancel = jest.spyOn(globalThis, "clearTimeout");
  try {
    await fireEvent(screen.getByTestId("preview"), "error", { nativeEvent: { error: "not ready" } });
    const retryIndex = schedule.mock.calls.findIndex((call) => call[1] === 2000);
    expect(retryIndex).toBeGreaterThanOrEqual(0);
    const retry = schedule.mock.results[retryIndex].value;
    await view.unmount();
    expect(cancel).toHaveBeenCalledWith(retry);
  } finally {
    schedule.mockRestore();
    cancel.mockRestore();
    jest.useRealTimers();
  }
});
