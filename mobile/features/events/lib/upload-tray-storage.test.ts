/* eslint-disable no-restricted-syntax -- Native File/Directory APIs require constructable filesystem test doubles. */
import { persistUploadTrays, restoreUploadTrays, retainUploadFiles, removeUploadStorage } from "./upload-tray-storage";
import type { Tray, TrayItem } from "./upload-tray";

const mockFiles = new Map<string, string>();
const mockDirectories = new Set<string>();
jest.mock("expo-file-system", () => {
  const uri = (parts: ({ uri: string } | string)[]) =>
    parts.map((part) => (typeof part === "string" ? part : part.uri).replace(/\/+$/, "")).join("/");
  class File {
    uri: string;
    constructor(...parts: ({ uri: string } | string)[]) {
      this.uri = uri(parts);
    }
    get name() {
      return this.uri.split("/").pop()!;
    }
    get exists() {
      return mockFiles.has(this.uri);
    }
    write(text: string) {
      mockFiles.set(this.uri, text);
    }
    textSync() {
      if (!this.exists) throw new Error("Missing");
      return mockFiles.get(this.uri)!;
    }
    async copy(destination: File) {
      destination.write(this.textSync());
    }
    delete() {
      mockFiles.delete(this.uri);
    }
  }
  class Directory {
    uri: string;
    constructor(...parts: ({ uri: string } | string)[]) {
      this.uri = uri(parts) + "/";
    }
    get exists() {
      return mockDirectories.has(this.uri);
    }
    create() {
      mockDirectories.add(this.uri);
    }
    list() {
      return [...mockFiles.keys()].filter((key) => key.startsWith(this.uri)).map((key) => new File(key));
    }
    delete() {
      this.list().forEach((file) => file.delete());
      mockDirectories.delete(this.uri);
    }
  }
  return { File, Directory, Paths: { document: "file://private" } };
});

const picked = (): TrayItem => ({
  key: "picked-1",
  name: "Photo",
  uri: "file://picker.jpg",
  contentType: "image/jpeg",
  sizeBytes: 3,
  status: { kind: "waiting" },
});
const tray = (items: TrayItem[]): Tray => ({ items, running: true, closed: null });

beforeEach(() => {
  removeUploadStorage("account-a");
  removeUploadStorage("account-b");
  mockFiles.clear();
  mockDirectories.clear();
  mockFiles.set("file://picker.jpg", "jpg");
});

test("retains exact bytes independently of the picker cache and restores interrupted jobs", async () => {
  const files = await retainUploadFiles("account-a", [picked()]);
  files[0]!.minted = { photoId: "reservation", seq: 1 };
  persistUploadTrays("account-a", new Map([["event", tray(files)]]));
  mockFiles.delete("file://picker.jpg");
  const restored = restoreUploadTrays("account-a").get("event")!;
  expect(restored.running).toBe(false);
  expect(restored.items[0]).toMatchObject({
    minted: { photoId: "reservation" },
    status: { kind: "failed", reason: "interrupted" },
  });
  expect(mockFiles.get(restored.items[0]!.uri)).toBe("jpg");
  expect(restoreUploadTrays("account-b").size).toBe(0);
});

test("recovers the preceding complete snapshot when the process stops during a write", async () => {
  const files = await retainUploadFiles("account-a", [picked()]);
  persistUploadTrays("account-a", new Map([["event", tray(files)]]));
  persistUploadTrays(
    "account-a",
    new Map([["event", tray([{ ...files[0]!, status: { kind: "sending", bytesSent: 2 } }])]]),
  );
  const latest = [...mockFiles.keys()]
    .filter((key) => key.includes("jobs-"))
    .sort()
    .at(-1)!;
  mockFiles.set(latest, '{"version":');
  expect(restoreUploadTrays("account-a").get("event")?.items).toHaveLength(1);
});

test("an unavailable picked file keeps its failure after restart without blocking valid files", async () => {
  const unavailable: TrayItem = {
    ...picked(),
    key: "picked-2",
    uri: "file://gone.jpg",
    sizeBytes: 0,
    status: { kind: "failed", reason: "missing" },
  };
  const files = await retainUploadFiles("account-a", [unavailable, picked()]);
  persistUploadTrays("account-a", new Map([["event", tray(files)]]));
  const restored = restoreUploadTrays("account-a").get("event")!;
  expect(restored.items[0]).toMatchObject({ key: "picked-2", uri: "", status: { kind: "failed", reason: "missing" } });
  expect(mockFiles.get(restored.items[1]!.uri)).toBe("jpg");
});

test("does not serialize signed URLs, skips byte-only writes and deletes only the signed-out account", async () => {
  const files = await retainUploadFiles("account-a", [picked()]);
  persistUploadTrays(
    "account-a",
    new Map([["event", tray([{ ...files[0]!, status: { kind: "sending", bytesSent: 1 } }])]]),
  );
  const paths = [...mockFiles.keys()];
  persistUploadTrays(
    "account-a",
    new Map([["event", tray([{ ...files[0]!, status: { kind: "sending", bytesSent: 2 } }])]]),
  );
  expect([...mockFiles.keys()]).toEqual(paths);
  const other = await retainUploadFiles("account-b", [picked()]);
  removeUploadStorage("account-a");
  expect(restoreUploadTrays("account-a").size).toBe(0);
  expect(mockFiles.has(other[0]!.uri)).toBe(true);
});
