import { roomShortfall, toTrayItems, trayName, type PickedFile } from "./picked-photos";

jest.mock("@/lib/api/generated/client.gen", () => ({ client: { getConfig: () => ({}) } }));
jest.mock("@react-native-community/netinfo", () => ({ addEventListener: () => () => undefined }));

const MB = 1024 * 1024;

const picked = (overrides: Partial<PickedFile> = {}): PickedFile => ({
  uri: "file://IMG_2231.HEIC",
  contentType: "image/heic",
  sizeBytes: 3 * MB,
  fileName: "IMG_2231.HEIC",
  isVideo: false,
  ...overrides,
});

test("names a photo without its extension and a video with it", () => {
  expect(trayName(picked(), "Photo 1")).toBe("IMG_2231");
  expect(trayName(picked({ fileName: "IMG_2260.MOV", isVideo: true }), "Photo 1")).toBe("IMG_2260.MOV");
  expect(trayName(picked({ fileName: null }), "Photo 1")).toBe("Photo 1");
});

test("rejects videos and photos over 25 MB before anything is sent", () => {
  const items = toTrayItems(
    [picked(), picked({ sizeBytes: 26 * MB }), picked({ fileName: "clip.MOV", isVideo: true })],
    (index) => `Photo ${index + 1}`,
  );

  expect(items.map((item) => item.status)).toEqual([
    { kind: "waiting" },
    { kind: "rejected", reason: "tooLarge" },
    { kind: "rejected", reason: "video" },
  ]);
  expect(new Set(items.map((item) => item.key)).size).toBe(3);
});

test("says nothing when the photos fit, or the roll has no limit", () => {
  const items = toTrayItems([picked(), picked()], String);
  expect(roomShortfall(items, 6 * MB)).toBeNull();
  expect(roomShortfall(items, null)).toBeNull();
});

test("an unmeasurable photo stays as a removable failure without taking upload space", () => {
  const items = toTrayItems([picked({ sizeBytes: 0 }), picked()], String);
  expect(items[0]?.status).toEqual({ kind: "failed", reason: "missing" });
  expect(items[1]?.status).toEqual({ kind: "waiting" });
  expect(roomShortfall(items, 3 * MB)).toBeNull();
});

test("offers the smallest photos that fit together when they don't all fit", () => {
  const items = toTrayItems(
    [4, 1, 3, 2, 5].map((size) => picked({ sizeBytes: size * MB })),
    String,
  );

  const shortfall = roomShortfall(items, 6.5 * MB);

  expect(shortfall?.wanted).toBe(5);
  expect(shortfall?.fits.map((item) => item.sizeBytes / MB)).toEqual([1, 2, 3]);
});

test("ignores rejected files when counting the room needed", () => {
  const items = toTrayItems([picked(), picked({ sizeBytes: 30 * MB })], String);
  expect(roomShortfall(items, 3 * MB)).toBeNull();
});
