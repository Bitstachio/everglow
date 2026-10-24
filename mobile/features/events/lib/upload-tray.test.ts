import type { EventPhotoFile, EventPhotoUpdate } from "../api/upload-event-photos";
import {
  addToTray,
  cancelTray,
  clearUploadTrays,
  developedAmount,
  developingFrames,
  dismissClosed,
  getTray,
  removeFromTray,
  retryTray,
  summarizeTray,
  type TrayItem,
} from "./upload-tray";
import { runAccountCleared } from "@/lib/account-cleared";

type Upload = (
  eventId: string,
  files: EventPhotoFile[],
  options: { onFile: (index: number, update: EventPhotoUpdate) => void; signal: AbortSignal },
) => Promise<unknown>;

const mockUpload = jest.fn<ReturnType<Upload>, Parameters<Upload>>();
let mockConnectionListener: ((state: { isConnected: boolean }) => void) | null = null;

jest.mock("../api/upload-event-photos", () => ({
  uploadEventPhotos: (...args: Parameters<Upload>) => mockUpload(...args),
}));
jest.mock("@react-native-community/netinfo", () => ({
  addEventListener: (listener: (state: { isConnected: boolean }) => void) => {
    mockConnectionListener = listener;
    return () => undefined;
  },
}));

const item = (key: string, status: TrayItem["status"] = { kind: "waiting" }): TrayItem => ({
  key,
  name: key,
  uri: `file://${key}.jpg`,
  contentType: "image/jpeg",
  sizeBytes: 100,
  status,
});

/** Every file develops, as photo-<key>. */
const developAll: Upload = async (_eventId, files, { onFile }) => {
  files.forEach((file, index) => onFile(index, { kind: "developed", photoId: file.uri }));
};

const settle = jest.fn().mockResolvedValue(undefined);

const flush = () => new Promise<void>((resolve) => setImmediate(() => resolve()));

beforeEach(() => {
  clearUploadTrays();
  mockUpload.mockReset().mockImplementation(developAll);
  settle.mockClear();
});

test("sends what can go, refreshes the roll, then drops the developed frames", async () => {
  addToTray("event-1", [item("a"), item("b"), item("big", { kind: "rejected", reason: "tooLarge" })], settle);
  expect(getTray("event-1").running).toBe(true);
  await flush();

  expect(mockUpload.mock.calls[0][1].map((file) => file.uri)).toEqual(["file://a.jpg", "file://b.jpg"]);
  expect(settle).toHaveBeenCalledTimes(1);
  expect(getTray("event-1")).toEqual({
    running: false,
    closed: null,
    items: [item("big", { kind: "rejected", reason: "tooLarge" })],
  });
});

test("keeps a frame that didn't take, and retries it", async () => {
  mockUpload.mockImplementationOnce(async (_eventId, _files, { onFile }) => {
    onFile(0, { kind: "failed", reason: "connection" });
    onFile(1, { kind: "developed", photoId: "p" });
  });
  addToTray("event-1", [item("a"), item("b")], settle);
  await flush();

  expect(getTray("event-1").items).toEqual([item("a", { kind: "failed", reason: "connection" })]);
  expect(summarizeTray(getTray("event-1"))).toMatchObject({ retryable: 1, offline: 1 });

  retryTray("event-1");
  await flush();
  expect(mockUpload).toHaveBeenCalledTimes(2);
  expect(getTray("event-1").items).toEqual([]);
});

test("retries a frame that lost its connection once the phone is back online", async () => {
  mockUpload.mockImplementationOnce(async (_eventId, _files, { onFile }) => {
    onFile(0, { kind: "failed", reason: "connection" });
  });
  addToTray("event-1", [item("a")], settle);
  await flush();

  mockConnectionListener?.({ isConnected: false });
  mockConnectionListener?.({ isConnected: true });
  await flush();

  expect(mockUpload).toHaveBeenCalledTimes(2);
  expect(getTray("event-1").items).toEqual([]);
});

test("doesn't retry a roll that closed, and Ok clears it", async () => {
  mockUpload.mockImplementationOnce(async (_eventId, _files, { onFile }) => {
    onFile(0, { kind: "developed", photoId: "p" });
    onFile(1, { kind: "failed", reason: "closed" });
  });
  addToTray("event-1", [item("a"), item("b")], settle);
  await flush();

  expect(getTray("event-1").closed).toEqual({ at: expect.any(String), landed: 1 });
  retryTray("event-1");
  await flush();
  expect(mockUpload).toHaveBeenCalledTimes(1);

  dismissClosed("event-1");
  expect(getTray("event-1")).toEqual({ items: [], running: false, closed: null });
});

test("Cancel the rest stops the upload and drops what hadn't gone", async () => {
  let release: () => void = () => undefined;
  mockUpload.mockImplementationOnce(
    (_eventId, _files, { onFile, signal }) =>
      new Promise<void>((resolve) => {
        onFile(0, { kind: "sending", bytesSent: 50 });
        release = () => {
          onFile(0, { kind: "failed", reason: signal.aborted ? "cancelled" : "refused" });
          resolve();
        };
      }),
  );
  addToTray("event-1", [item("a"), item("b")], settle);
  expect(developedAmount(getTray("event-1").items[0]!)).toBe(0.5);

  cancelTray("event-1");
  expect(getTray("event-1").items.map((entry) => entry.key)).toEqual(["a"]);
  release();
  await flush();

  expect(getTray("event-1").items).toEqual([]);
  expect(mockUpload).toHaveBeenCalledTimes(1);
});

test("removes a file that can't be added", () => {
  mockUpload.mockImplementation(() => new Promise(() => undefined));
  addToTray("event-1", [item("a"), item("clip", { kind: "rejected", reason: "video" })], settle);

  removeFromTray("event-1", "clip");

  expect(getTray("event-1").items.map((entry) => entry.key)).toEqual(["a"]);
});

test("clearing the account empties every tray", () => {
  mockUpload.mockImplementation(() => new Promise(() => undefined));
  addToTray("event-1", [item("a")], settle);

  runAccountCleared();

  expect(getTray("event-1").items).toEqual([]);
});

test("puts the tray's photos at the top of the sheet, numbered after the roll, until the roll has them", () => {
  const items = [
    item("c", { kind: "developed", photoId: "on-roll" }),
    item("b", { kind: "sending", bytesSent: 25 }),
    item("a", { kind: "failed", reason: "connection" }),
    item("v", { kind: "rejected", reason: "video" }),
  ];

  const frames = developingFrames(items, [{ id: "on-roll" }, { id: "older" }], 2);

  expect(frames.map(({ item: frame, number, develop, crossed }) => [frame.key, number, develop, crossed])).toEqual([
    ["b", 4, 0.25, false],
    ["a", 3, 0, true],
  ]);
});
