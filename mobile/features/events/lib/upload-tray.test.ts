import { developedAmount, developingFrames, summarizeTray, trayEntries } from "./upload-tray-view";
import type { EventPhotoFile, EventPhotoUpdate } from "../api/upload-event-photos";
import {
  addToTray,
  activateUploadTrays,
  reconcileTrayPhotos,
  cancelTray,
  clearUploadTrays,
  dismissClosed,
  getTray,
  getTraySession,
  openTraySession,
  localFileFor,
  removeFromTray,
  retryTray,
  type TrayItem,
} from "./upload-tray";
import { runAccountCleared } from "@/lib/account-cleared";

type Upload = (
  eventId: string,
  files: EventPhotoFile[],
  options: {
    onFile: (index: number, update: EventPhotoUpdate) => void;
    onMinted: (minted: { index: number; photoId: string }[]) => void;
    signal: AbortSignal;
    requestSignal: AbortSignal;
  },
) => Promise<unknown>;

const mockRestore = jest.fn(() => new Map());
const mockPersist = jest.fn();
jest.mock("./upload-tray-storage", () => ({
  restoreUploadTrays: () => mockRestore(),
  persistUploadTrays: (...args: unknown[]) => mockPersist(...args),
  releaseUploadFile: jest.fn(),
  removeUploadStorage: jest.fn(),
}));

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
  settle.mockReset().mockResolvedValue(undefined);
  mockPersist.mockReset();
  mockRestore.mockReset().mockReturnValue(new Map());
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

test("sends photos added while the roll was refreshing after the last ones", async () => {
  let refreshed: () => void = () => undefined;
  settle.mockImplementationOnce(() => new Promise<void>((resolve) => (refreshed = resolve)));
  addToTray("event-1", [item("a")], settle);
  await flush();
  expect(settle).toHaveBeenCalledTimes(1);

  // Picked again before the roll's refresh came back.
  addToTray("event-1", [item("b")], settle);
  refreshed();
  await flush();

  expect(mockUpload.mock.calls.map(([, files]) => files.map((file) => file.uri))).toEqual([
    ["file://a.jpg"],
    ["file://b.jpg"],
  ]);
  expect(getTray("event-1")).toEqual({ running: false, closed: null, items: [] });
});

test("an open tray keeps completed rows in place after refresh without persisting history", async () => {
  activateUploadTrays("account-a", settle);
  mockUpload.mockImplementationOnce(async (_eventId, _files, { onFile }) => {
    onFile(0, { kind: "developed", photoId: "p1" });
    onFile(1, { kind: "failed", reason: "refused" });
    onFile(2, { kind: "developed", photoId: "p3" });
  });
  const close = openTraySession("event-1");
  addToTray("event-1", [item("a"), item("b"), item("c")], settle);
  await flush();

  expect(getTraySession("event-1").items.map(({ key, status }) => [key, status.kind])).toEqual([
    ["a", "developed"],
    ["b", "failed"],
    ["c", "developed"],
  ]);
  expect(getTray("event-1").items.map(({ key }) => key)).toEqual(["b"]);
  expect(
    mockPersist.mock.calls
      .at(-1)![1]
      .get("event-1")
      .items.map(({ key }: TrayItem) => key),
  ).toEqual(["b"]);
  close();
  const closeNext = openTraySession("event-1");
  addToTray("event-1", [item("new")], settle);
  await flush();
  expect(getTraySession("event-1").items.map(({ key }) => key)).toEqual(["new", "b"]);
  closeNext();
});

test("closing the tray while uploading keeps work running and drops success history for the next visit", async () => {
  let finish: () => void = () => undefined;
  mockUpload.mockImplementationOnce(
    (_eventId, _files, { onFile }) =>
      new Promise<void>((resolve) => {
        finish = () => {
          onFile(0, { kind: "developed", photoId: "p1" });
          resolve();
        };
      }),
  );
  const close = openTraySession("event-1");
  addToTray("event-1", [item("a")], settle);
  close();
  expect(mockUpload.mock.calls[0]![2].signal.aborted).toBe(false);
  expect(getTray("event-1").items.map(({ key }) => key)).toEqual(["a"]);
  finish();
  await flush();
  const closeNext = openTraySession("event-1");
  expect(getTraySession("event-1").items).toEqual([]);
  closeNext();
});

test("server reconciliation marks a recovered row as completed for this visit only", () => {
  const recovered = {
    ...item("restored", { kind: "failed" as const, reason: "interrupted" as const }),
    minted: { photoId: "ready", seq: 1 },
  };
  mockRestore.mockReturnValueOnce(new Map([["event-1", { items: [recovered], running: false, closed: null }]]));
  activateUploadTrays("account-a", settle);
  const close = openTraySession("event-1");
  reconcileTrayPhotos("event-1", [{ id: "ready" }]);
  expect(getTraySession("event-1").items[0]?.status).toEqual({ kind: "developed", photoId: "ready" });
  expect(getTray("event-1").items).toEqual([]);
  close();
  expect(getTraySession("event-1").items).toEqual([]);
  expect(mockUpload).not.toHaveBeenCalled();
});

test("cancelled rows disappear while completed rows remain until the tray closes", async () => {
  const close = openTraySession("event-1");
  mockUpload.mockImplementationOnce(async (_eventId, _files, { onFile }) => {
    onFile(0, { kind: "developed", photoId: "p1" });
    onFile(1, { kind: "failed", reason: "cancelled" });
  });
  addToTray("event-1", [item("a"), item("b")], settle);
  await flush();
  expect(getTraySession("event-1").items.map(({ key }) => key)).toEqual(["a"]);
  close();
  expect(getTraySession("event-1").items).toEqual([]);
});

test("sign-out clears visible history and an old focus cleanup cannot close a new account's tray", async () => {
  const closeOld = openTraySession("event-1");
  addToTray("event-1", [item("old")], settle);
  await flush();
  runAccountCleared();
  expect(getTraySession("event-1").items).toEqual([]);
  const closeNew = openTraySession("event-1");
  addToTray("event-1", [item("new")], settle);
  await flush();
  closeOld();
  expect(getTraySession("event-1").items.map(({ key }) => key)).toEqual(["new"]);
  closeNew();
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

test("orders developing frames the way the roll will list them once they land", async () => {
  // The API lists one mint's photos by id, descending, and a later mint first.
  mockUpload.mockImplementationOnce(async (_eventId, _files, { onMinted, onFile }) => {
    onMinted([
      { index: 0, photoId: "b" },
      { index: 1, photoId: "d" },
    ]);
    onMinted([{ index: 2, photoId: "a" }]);
    onFile(0, { kind: "sending", bytesSent: 10 });
    await new Promise(() => undefined);
  });
  addToTray("event-1", [item("first"), item("second"), item("third"), item("fourth")], settle);
  await flush();

  const order = developingFrames(getTray("event-1").items, [], 0).map(({ item: frame, number }) => [frame.key, number]);
  expect(order).toEqual([
    ["fourth", 4],
    ["third", 3],
    ["second", 2],
    ["first", 1],
  ]);
});

test("remembers the local file of a developed photo, until the account is cleared", async () => {
  addToTray("event-1", [item("a")], settle);
  await flush();

  expect(localFileFor("file://a.jpg")).toBe("file://a.jpg");
  runAccountCleared();
  expect(localFileFor("file://a.jpg")).toBeUndefined();
});

describe("trayEntries", () => {
  it("numbers a file developing on the sheet, and one already on the roll where the roll has it", () => {
    const entries = trayEntries(
      [item("a", { kind: "developed", photoId: "p2" }), item("b", { kind: "sending", bytesSent: 50 })],
      [{ id: "p2" }, { id: "p1" }],
    );
    expect(entries.map(({ item: { key }, number, develop }) => ({ key, number, develop }))).toEqual([
      { key: "a", number: 2, develop: 1 },
      { key: "b", number: 3, develop: 0.5 },
    ]);
  });
});

test("late updates from a cleared account cannot change its replacement tray", async () => {
  let finishOld: () => void = () => undefined;
  mockUpload.mockImplementationOnce(
    (_eventId, _files, { onFile }) =>
      new Promise<void>((resolve) => {
        finishOld = () => {
          onFile(0, { kind: "failed", reason: "closed" });
          resolve();
        };
      }),
  );
  addToTray("event-1", [item("old")], settle);
  runAccountCleared();
  expect(mockUpload.mock.calls[0]![2].requestSignal.aborted).toBe(true);
  const settleNew = jest.fn().mockResolvedValue(undefined);
  mockUpload.mockImplementationOnce(() => new Promise(() => undefined));
  addToTray("event-1", [item("new")], settleNew);
  finishOld();
  await flush();
  expect(getTray("event-1")).toEqual({ items: [item("new")], running: true, closed: null });
  expect(settleNew).not.toHaveBeenCalled();
  cancelTray("event-1");
  expect(mockUpload.mock.calls[1]![2].signal.aborted).toBe(true);
});

test("retains confirmed frames if refreshing the roll fails", async () => {
  settle.mockRejectedValueOnce(new Error("Offline"));
  addToTray("event-1", [item("a")], settle);
  await flush();
  expect(getTray("event-1").items[0]?.status).toEqual({ kind: "developed", photoId: "file://a.jpg" });
  expect(getTray("event-1").running).toBe(false);
});

test("restores interrupted photos for the signed-in account without silently starting them", async () => {
  const interrupted = {
    ...item("restored", { kind: "failed" as const, reason: "interrupted" as const }),
    minted: { photoId: "previous", seq: 1 },
  };
  mockRestore.mockReturnValueOnce(new Map([["event-1", { items: [interrupted], running: false, closed: null }]]));
  activateUploadTrays("account-a", settle);
  expect(getTray("event-1").items[0]).toEqual(interrupted);
  expect(mockUpload).not.toHaveBeenCalled();
  retryTray("event-1");
  await flush();
  expect(mockUpload.mock.calls[0]![1][0]).toMatchObject({ resumePhotoId: "previous" });
});

test("a photo already on the server clears a stale recovered failure", () => {
  const recovered = {
    ...item("restored", { kind: "failed" as const, reason: "interrupted" as const }),
    minted: { photoId: "ready", seq: 1 },
  };
  mockRestore.mockReturnValueOnce(new Map([["event-1", { items: [recovered], running: false, closed: null }]]));
  activateUploadTrays("account-a", settle);
  reconcileTrayPhotos("event-1", [{ id: "ready" }]);
  expect(getTray("event-1").items).toEqual([]);
  expect(mockUpload).not.toHaveBeenCalled();
});

test("bounds automatic connection retries and clears scheduled work on sign-out", async () => {
  jest.useFakeTimers();
  try {
    mockConnectionListener?.({ isConnected: true });
    mockUpload.mockImplementation(async (_eventId, _files, { onFile }) =>
      onFile(0, { kind: "failed", reason: "connection" }),
    );
    addToTray("event-1", [item("a")], settle);
    await jest.advanceTimersByTimeAsync(20000);
    expect(mockUpload).toHaveBeenCalledTimes(4);
    expect(getTray("event-1").items[0]?.status).toEqual({ kind: "failed", reason: "connection" });
    runAccountCleared();
    await jest.advanceTimersByTimeAsync(60000);
    expect(mockUpload).toHaveBeenCalledTimes(4);
  } finally {
    jest.useRealTimers();
  }
});

test("does not send jobs when their durable state cannot be written", async () => {
  activateUploadTrays("account-a", settle);
  mockPersist.mockImplementation(() => {
    throw new Error("Disk full");
  });
  addToTray("event-1", [item("a")], settle);
  await flush();
  expect(mockUpload).not.toHaveBeenCalled();
  expect(getTray("event-1").storageError).toBe(true);
  expect(getTray("event-1").items[0]?.status).toEqual({ kind: "failed", reason: "refused" });
});

test("native byte progress does not serialize the durable queue for every callback", () => {
  activateUploadTrays("account-a", settle);
  mockUpload.mockImplementationOnce((_eventId, _files, { onFile }) => {
    onFile(0, { kind: "sending", bytesSent: 0 });
    const writes = mockPersist.mock.calls.length;
    for (let bytesSent = 1; bytesSent <= 100; bytesSent += 1) onFile(0, { kind: "sending", bytesSent });
    expect(mockPersist).toHaveBeenCalledTimes(writes);
    return new Promise(() => undefined);
  });
  addToTray("event-1", [item("a")], settle);
  expect(getTray("event-1").items[0]?.status).toEqual({ kind: "sending", bytesSent: 100 });
});

test("Cancel removes pending connection retries so reconnecting cannot resume cancelled work", async () => {
  let finish: () => void = () => undefined;
  mockUpload.mockImplementationOnce(
    (_eventId, _files, { onFile }) =>
      new Promise<void>((resolve) => {
        onFile(0, { kind: "failed", reason: "connection" });
        onFile(1, { kind: "sending", bytesSent: 1 });
        finish = () => {
          onFile(1, { kind: "failed", reason: "cancelled" });
          resolve();
        };
      }),
  );
  addToTray("event-1", [item("offline"), item("sending")], settle);
  cancelTray("event-1");
  finish();
  await flush();
  mockConnectionListener?.({ isConnected: false });
  mockConnectionListener?.({ isConnected: true });
  await flush();
  expect(mockUpload).toHaveBeenCalledTimes(1);
  expect(getTray("event-1").items).toEqual([]);
});
