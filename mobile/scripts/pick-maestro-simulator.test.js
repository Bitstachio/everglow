const { parseRuntime, pickSimulator } = require("./pick-maestro-simulator");

const runtimeKey = (version) => `com.apple.CoreSimulator.SimRuntime.iOS-${version.replace(/\./g, "-")}`;

const list = {
  devices: {
    [runtimeKey("26.2")]: [
      { name: "iPhone 16e", udid: "16E-262", isAvailable: true },
      { name: "iPhone 17", udid: "17-262", isAvailable: true },
    ],
    [runtimeKey("26.5")]: [
      { name: "iPhone 17", udid: "17-265", isAvailable: true },
      { name: "iPhone 17 Pro", udid: "17PRO-265", isAvailable: true },
      { name: "iPad (A16)", udid: "IPAD-265", isAvailable: true },
    ],
    [runtimeKey("26.4")]: [{ name: "iPhone 17", udid: "17-264", isAvailable: true }],
    "com.apple.CoreSimulator.SimRuntime.watchOS-26-5": [{ name: "Apple Watch", udid: "W", isAvailable: true }],
  },
};

test("reads iOS runtime names from simctl keys", () => {
  expect(parseRuntime(runtimeKey("26.5"))).toEqual({ name: "iOS 26.5", version: [26, 5, 0] });
  expect(parseRuntime(runtimeKey("18.3.1"))).toEqual({ name: "iOS 18.3.1", version: [18, 3, 1] });
  expect(parseRuntime("com.apple.CoreSimulator.SimRuntime.watchOS-26-5")).toBeNull();
});

test("picks the pinned model on the pinned runtime", () => {
  expect(pickSimulator(list, { model: "iPhone 17", runtime: "iOS 26.2" })).toEqual({
    ok: true,
    udid: "17-262",
    name: "iPhone 17",
    runtime: "iOS 26.2",
    fallback: false,
  });
});

test("matches the model name exactly", () => {
  const picked = pickSimulator(list, { model: "iPhone 17", runtime: "iOS 26.5" });
  expect(picked).toMatchObject({ ok: true, udid: "17-265", fallback: false });
});

test("falls back to the newest runtime that has the model", () => {
  expect(pickSimulator(list, { model: "iPhone 17", runtime: "iOS 27.0" })).toMatchObject({
    ok: true,
    udid: "17-265",
    runtime: "iOS 26.5",
    fallback: true,
  });
});

test("skips devices simctl marks unavailable", () => {
  const stale = {
    devices: {
      [runtimeKey("26.5")]: [{ name: "iPhone 17", udid: "GONE", isAvailable: false }],
      [runtimeKey("26.4")]: [{ name: "iPhone 17", udid: "17-264", isAvailable: true }],
    },
  };
  expect(pickSimulator(stale, { model: "iPhone 17", runtime: "iOS 26.5" })).toMatchObject({
    udid: "17-264",
    fallback: true,
  });
});

test("lists every available iPhone, newest runtime first, when the model is missing", () => {
  expect(pickSimulator(list, { model: "iPhone 99", runtime: "iOS 26.5" })).toEqual({
    ok: false,
    available: ["iOS 26.5: iPhone 17, iPhone 17 Pro", "iOS 26.4: iPhone 17", "iOS 26.2: iPhone 16e, iPhone 17"],
  });
});

test("reports an empty list when the runner has no iPhone simulators", () => {
  expect(pickSimulator({ devices: {} }, { model: "iPhone 17", runtime: "iOS 26.5" })).toEqual({
    ok: false,
    available: [],
  });
});
