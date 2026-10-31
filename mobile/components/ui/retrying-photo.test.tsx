import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { RetryingPhoto } from "./retrying-photo";

const fail = () => fireEvent(screen.getByTestId("preview"), "error", { nativeEvent: { error: "not ready" } });

test("uses the supplied image variant and stable cache identity", async () => {
  await render(<RetryingPhoto testID="preview" uri="https://bucket/thumb.webp" cacheKey="photo:1:thumbnail" />);
  expect(screen.getByTestId("preview").props.source).toEqual([
    {
      uri: "https://bucket/thumb.webp",
      cacheKey: "photo:1:thumbnail",
    },
  ]);
});

test("retries a missing image three times, then keeps the placeholder, however often its link is re-signed", async () => {
  jest.useFakeTimers();
  const view = await render(
    <RetryingPhoto testID="preview" uri="https://bucket/thumb.webp?v=0" cacheKey="photo:2:thumbnail" />,
  );
  try {
    for (const [index, delay] of [2000, 5000, 10000].entries()) {
      await fail();
      expect(screen.queryByTestId("preview")).not.toBeOnTheScreen();
      // Every list fetch signs the URL anew; that doesn't cut the wait short.
      await view.rerender(
        <RetryingPhoto
          testID="preview"
          uri={`https://bucket/thumb.webp?v=${index + 1}`}
          cacheKey="photo:2:thumbnail"
        />,
      );
      expect(screen.queryByTestId("preview")).not.toBeOnTheScreen();
      await act(async () => {
        jest.advanceTimersByTime(delay);
      });
      expect(screen.getByTestId("preview").props.source[0].uri).toBe(`https://bucket/thumb.webp?v=${index + 1}`);
    }
    await fail();
    await view.rerender(
      <RetryingPhoto testID="preview" uri="https://bucket/thumb.webp?refreshed" cacheKey="photo:2:thumbnail" />,
    );
    await act(async () => {
      jest.advanceTimersByTime(60000);
    });
    expect(screen.queryByTestId("preview")).not.toBeOnTheScreen();
  } finally {
    await view.unmount();
    jest.useRealTimers();
  }
});

test("a frame that remounts doesn't ask again for an image known to be missing", async () => {
  jest.useFakeTimers();
  const photo = (uri: string) => <RetryingPhoto testID="preview" uri={uri} cacheKey="photo:3:thumbnail" />;
  try {
    let view = await render(photo("https://bucket/thumb.webp?a"));
    for (const delay of [2000, 5000, 10000]) {
      await fail();
      await act(async () => {
        jest.advanceTimersByTime(delay);
      });
    }
    await fail();
    await view.unmount();

    // Scrolled away and back, after a refresh signed a new URL.
    view = await render(photo("https://bucket/thumb.webp?b"));
    expect(screen.queryByTestId("preview")).not.toBeOnTheScreen();
    await view.unmount();

    // Another image keeps its own attempts.
    view = await render(
      <RetryingPhoto testID="preview" uri="https://bucket/other.webp" cacheKey="photo:4:thumbnail" />,
    );
    expect(screen.getByTestId("preview")).toBeOnTheScreen();
    await view.unmount();
  } finally {
    jest.useRealTimers();
  }
});

test("cancels a pending retry when its frame unmounts", async () => {
  jest.useFakeTimers();
  const view = await render(<RetryingPhoto testID="preview" uri="https://bucket/unkeyed.webp" />);
  const schedule = jest.spyOn(globalThis, "setTimeout");
  const cancel = jest.spyOn(globalThis, "clearTimeout");
  try {
    await fail();
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
