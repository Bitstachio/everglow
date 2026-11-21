import { onlineManager } from "@tanstack/react-query";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { RetryingPhoto } from "./retrying-photo";

afterEach(() => onlineManager.setOnline(true));

const fail = () => fireEvent(screen.getByTestId("preview"), "error", { nativeEvent: { error: "not ready" } });

/** An image that can't be late gives up after its one retry: fail, wait it out, fail again. Needs fake timers. */
const failForGood = async () => {
  await fail();
  expect(screen.queryByTestId("preview")).not.toBeOnTheScreen();
  await act(async () => {
    jest.advanceTimersByTime(2000);
  });
  await fail();
};

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

describe("fallback", () => {
  const original = (id: string) => ({ uri: `https://bucket/${id}.jpg`, cacheKey: `photo:${id}:original` });

  test("shows the fallback once a missing image has used up its retries", async () => {
    jest.useFakeTimers();
    const view = await render(
      <RetryingPhoto
        testID="preview"
        uri="https://bucket/a.webp"
        cacheKey="photo:a:thumbnail"
        fallback={original("a")}
      />,
    );
    try {
      for (const delay of [2000, 5000, 10000]) {
        await fail();
        // Waiting for a late thumbnail doesn't download the photo meanwhile.
        expect(screen.queryByTestId("preview")).not.toBeOnTheScreen();
        await act(async () => {
          jest.advanceTimersByTime(delay);
        });
      }
      await fail();
      expect(screen.getByTestId("preview").props.source).toEqual([original("a")]);
      expect(screen.getByTestId("preview").props.priority).toBe("low");
    } finally {
      await view.unmount();
      jest.useRealTimers();
    }
  });

  test("an image that can't be late is tried once more, then goes to the fallback", async () => {
    jest.useFakeTimers();
    const view = await render(
      <RetryingPhoto
        testID="preview"
        uri="https://bucket/b.webp"
        cacheKey="photo:b:thumbnail"
        fallback={original("b")}
        mayBeLate={false}
      />,
    );
    try {
      await fail();
      // One failure can be an expired link or a dropped request: the photo isn't downloaded for it.
      expect(screen.queryByTestId("preview")).not.toBeOnTheScreen();
      await act(async () => {
        jest.advanceTimersByTime(2000);
      });
      expect(screen.getByTestId("preview").props.source).toEqual([
        { uri: "https://bucket/b.webp", cacheKey: "photo:b:thumbnail" },
      ]);

      await fail();
      expect(screen.getByTestId("preview").props.source).toEqual([original("b")]);
      // The full photo is decoded at the frame's size.
      expect(screen.getByTestId("preview").props.enforceEarlyResizing).toBe(true);
    } finally {
      await view.unmount();
      jest.useRealTimers();
    }
  });

  test("a second try that loads keeps the image, with a re-signed link", async () => {
    jest.useFakeTimers();
    const photo = (uri: string) => (
      <RetryingPhoto
        testID="preview"
        uri={uri}
        cacheKey="photo:b2:thumbnail"
        fallback={original("b2")}
        mayBeLate={false}
      />
    );
    const view = await render(photo("https://bucket/b2.webp?expired"));
    try {
      await fail();
      await view.rerender(photo("https://bucket/b2.webp?fresh"));
      await act(async () => {
        jest.advanceTimersByTime(2000);
      });
      expect(screen.getByTestId("preview").props.source).toEqual([
        { uri: "https://bucket/b2.webp?fresh", cacheKey: "photo:b2:thumbnail" },
      ]);
    } finally {
      await view.unmount();
      jest.useRealTimers();
    }
  });

  test("with no image link, shows the fallback straight away", async () => {
    await render(<RetryingPhoto testID="preview" cacheKey="photo:c:thumbnail" fallback={original("c")} />);
    expect(screen.getByTestId("preview").props.source).toEqual([original("c")]);
  });

  test("stays on the fallback when the frame remounts or the image is re-signed", async () => {
    const photo = (uri: string) => (
      <RetryingPhoto
        testID="preview"
        uri={uri}
        cacheKey="photo:d:thumbnail"
        fallback={original("d")}
        mayBeLate={false}
      />
    );
    jest.useFakeTimers();
    try {
      let view = await render(photo("https://bucket/d.webp?a"));
      await failForGood();
      // A refetch signs the thumbnail anew; it isn't asked for again, so the frame doesn't swap.
      await view.rerender(photo("https://bucket/d.webp?b"));
      expect(screen.getByTestId("preview").props.source).toEqual([original("d")]);
      await view.unmount();

      view = await render(photo("https://bucket/d.webp?c"));
      expect(screen.getByTestId("preview").props.source).toEqual([original("d")]);
      await view.unmount();
    } finally {
      jest.useRealTimers();
    }
  });

  test("leaves the parent's placeholder when the fallback fails too", async () => {
    jest.useFakeTimers();
    const view = await render(
      <RetryingPhoto
        testID="preview"
        uri="https://bucket/e.webp"
        cacheKey="photo:e:thumbnail"
        fallback={original("e")}
        mayBeLate={false}
      />,
    );
    try {
      await failForGood();
      expect(screen.getByTestId("preview").props.source).toEqual([original("e")]);
      // The photo exists, so its failure is likely a dropped connection: it is retried like any image.
      for (const delay of [2000, 5000, 10000]) {
        await fail();
        expect(screen.queryByTestId("preview")).not.toBeOnTheScreen();
        await act(async () => {
          jest.advanceTimersByTime(delay);
        });
        expect(screen.getByTestId("preview").props.source).toEqual([original("e")]);
      }
      await fail();
      await act(async () => {
        jest.advanceTimersByTime(60000);
      });
      expect(screen.queryByTestId("preview")).not.toBeOnTheScreen();
    } finally {
      await view.unmount();
      jest.useRealTimers();
    }
  });
});

describe("without a network", () => {
  const original = { uri: "https://bucket/original.jpg", cacheKey: "photo:20:original" };

  test("a failed load isn't counted: the same image is asked for again once the network is back", async () => {
    const view = await render(
      <RetryingPhoto
        testID="preview"
        uri="https://bucket/thumb.webp"
        cacheKey="photo:20:thumbnail"
        fallback={original}
        mayBeLate={false}
      />,
    );
    jest.useFakeTimers();
    try {
      await act(async () => onlineManager.setOnline(false));
      await fail();
      // The parent's placeholder shows meanwhile, and the full photo is not asked for.
      expect(screen.queryByTestId("preview")).not.toBeOnTheScreen();

      await act(async () => onlineManager.setOnline(true));

      expect(screen.getByTestId("preview").props.source).toEqual([
        { uri: "https://bucket/thumb.webp", cacheKey: "photo:20:thumbnail" },
      ]);
      // Online again, failures count as before: an older photo goes to the original after its one retry.
      await failForGood();
      expect(screen.getByTestId("preview").props.source).toEqual([original]);
    } finally {
      await view.unmount();
      jest.useRealTimers();
    }
  });

  test("giving up on a fallback doesn't blank the same photo where it is asked for on purpose", async () => {
    jest.useFakeTimers();
    const own = { uri: "https://bucket/own.jpg", cacheKey: "photo:22:original" };
    const view = await render(<RetryingPhoto testID="preview" cacheKey="photo:22:thumbnail" fallback={own} />);
    try {
      // The fallback uses up its tries.
      for (const delay of [2000, 5000, 10000]) {
        await fail();
        await act(async () => {
          jest.advanceTimersByTime(delay);
        });
      }
      await fail();
      expect(screen.queryByTestId("preview")).not.toBeOnTheScreen();
      await view.unmount();

      // The viewer, or a report, loads the photo itself under the same cache key.
      const viewer = await render(<RetryingPhoto testID="preview" {...own} />);
      expect(screen.getByTestId("preview").props.source).toEqual([own]);
      await viewer.unmount();
    } finally {
      jest.useRealTimers();
    }
  });

  test("a frame that remounts while offline asks again, since nothing was learned about its image", async () => {
    const photo = <RetryingPhoto testID="preview" uri="https://bucket/thumb.webp" cacheKey="photo:21:thumbnail" />;
    let view = await render(photo);
    await act(async () => onlineManager.setOnline(false));
    await fail();
    await view.unmount();

    view = await render(photo);

    expect(screen.getByTestId("preview")).toBeOnTheScreen();
    await view.unmount();
  });
});
