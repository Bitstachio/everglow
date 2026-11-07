import { jitteredLinearBackoffMs, mapWithConcurrency, sleep } from "./async.utils";

describe("sleep", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it("resolves only once the delay has elapsed", async () => {
    jest.useFakeTimers();
    let resolved = false;
    const pending = sleep(1000).then(() => {
      resolved = true;
    });

    jest.advanceTimersByTime(999);
    await Promise.resolve();
    expect(resolved).toBe(false);

    jest.advanceTimersByTime(1);
    await pending;
    expect(resolved).toBe(true);
  });

  it("resolves on the next tick for a zero delay", async () => {
    await expect(sleep(0)).resolves.toBeUndefined();
  });
});

describe("jitteredLinearBackoffMs", () => {
  const BASE = 25;

  const withRandom = <T>(value: number, run: () => T): T => {
    const spy = jest.spyOn(Math, "random").mockReturnValue(value);
    try {
      return run();
    } finally {
      spy.mockRestore();
    }
  };

  it("grows linearly with the attempt number", () => {
    // No jitter, so the growth is visible on its own.
    const delays = withRandom(0, () => [1, 2, 3].map((attempt) => jitteredLinearBackoffMs(attempt, BASE)));

    expect(delays).toEqual([BASE, BASE * 2, BASE * 3]);
  });

  it("adds at most one further base delay of jitter", () => {
    // Math.random() is exclusive of 1, so this is the supremum, never reached.
    expect(withRandom(0.999999, () => jitteredLinearBackoffMs(1, BASE))).toBeLessThan(BASE * 2);
    expect(withRandom(0.5, () => jitteredLinearBackoffMs(1, BASE))).toBe(BASE * 1.5);
  });

  it("keeps every real sample inside its attempt's window", () => {
    for (let attempt = 1; attempt <= 5; attempt++) {
      for (let sample = 0; sample < 200; sample++) {
        const delay = jitteredLinearBackoffMs(attempt, BASE);

        expect(delay).toBeGreaterThanOrEqual(BASE * attempt);
        expect(delay).toBeLessThan(BASE * (attempt + 1));
      }
    }
  });

  it("spreads concurrent losers of the same round apart", () => {
    // The whole point of the jitter: identical callers must not wake together.
    const delays = new Set(Array.from({ length: 50 }, () => jitteredLinearBackoffMs(1, BASE)));

    expect(delays.size).toBeGreaterThan(1);
  });
});

describe("mapWithConcurrency", () => {
  it("keeps the input order and never runs more than the limit at once", async () => {
    let inFlight = 0;
    let peak = 0;
    const results = await mapWithConcurrency([30, 10, 20, 5, 15], 2, async (ms, index) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await sleep(ms);
      inFlight -= 1;
      return `${index}:${ms}`;
    });

    expect(results).toEqual(["0:30", "1:10", "2:20", "3:5", "4:15"]);
    expect(peak).toBe(2);
  });

  it("returns an empty list without calling the function", async () => {
    const fn = jest.fn();

    await expect(mapWithConcurrency([], 4, fn)).resolves.toEqual([]);
    expect(fn).not.toHaveBeenCalled();
  });

  it("rejects when a call does", async () => {
    await expect(
      mapWithConcurrency([1, 2], 2, (item) => (item === 2 ? Promise.reject(new Error("boom")) : Promise.resolve(item))),
    ).rejects.toThrow("boom");
  });
});
