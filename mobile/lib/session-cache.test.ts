/* eslint-disable no-restricted-syntax -- Native File/Directory APIs require constructable filesystem test doubles. */
import type { User } from "@/lib/auth";
import {
  readSessionSnapshot,
  removeSessionSnapshot,
  saveSessionSnapshot,
  SESSION_SNAPSHOT_MAX_AGE_MS,
  type SessionSnapshot,
} from "./session-cache";

const mockFiles = new Map<string, string>();
jest.mock("expo-file-system", () => {
  const uri = (parts: ({ uri: string } | string)[]) =>
    parts.map((part) => (typeof part === "string" ? part : part.uri).replace(/\/+$/, "")).join("/");
  class File {
    uri: string;
    constructor(...parts: ({ uri: string } | string)[]) {
      this.uri = uri(parts);
    }
    get exists() {
      return mockFiles.has(this.uri);
    }
    write(text: string) {
      mockFiles.set(this.uri, text);
    }
    textSync() {
      return mockFiles.get(this.uri)!;
    }
    delete() {
      mockFiles.delete(this.uri);
    }
  }
  class Directory {
    uri: string;
    constructor(...parts: ({ uri: string } | string)[]) {
      this.uri = uri(parts);
    }
    create() {}
  }
  return { File, Directory, Paths: { cache: "file://cache" } };
});

const SNAPSHOT_FILE = "file://cache/session/snapshot.json";
const NOW = Date.parse("2026-11-11T21:40:00Z");

const snapshot = (overrides: Partial<SessionSnapshot> = {}): SessionSnapshot => ({
  savedAt: NOW,
  userId: "user-1",
  identity: { sub: "auth0|1", email: "sam@example.com", name: "Sam" },
  profile: { id: "user-1", isOnboarded: true } as unknown as User,
  queries: { queries: [], mutations: [] },
  ...overrides,
});

beforeEach(() => mockFiles.clear());

test("a saved session reads back for the person signed in", () => {
  saveSessionSnapshot(snapshot());

  expect(readSessionSnapshot({ sub: "auth0|1", now: NOW })).toEqual(snapshot());
});

test("offline, when Auth0 can't say who is signed in, the session on this phone is theirs", () => {
  saveSessionSnapshot(snapshot());

  expect(readSessionSnapshot({ sub: undefined, now: NOW })?.userId).toBe("user-1");
});

test("another person's session is never shown and is deleted", () => {
  saveSessionSnapshot(snapshot());

  expect(readSessionSnapshot({ sub: "auth0|2", now: NOW })).toBeNull();
  expect(mockFiles.has(SNAPSHOT_FILE)).toBe(false);
});

test("a snapshot older than a week is deleted rather than shown", () => {
  saveSessionSnapshot(snapshot({ savedAt: NOW - SESSION_SNAPSHOT_MAX_AGE_MS - 1 }));

  expect(readSessionSnapshot({ sub: "auth0|1", now: NOW })).toBeNull();
  expect(mockFiles.has(SNAPSHOT_FILE)).toBe(false);
});

test("an unreadable snapshot, cut off mid-write or from another version, is deleted", () => {
  mockFiles.set(SNAPSHOT_FILE, '{"version":1,"savedAt":');
  expect(readSessionSnapshot({ sub: "auth0|1", now: NOW })).toBeNull();
  expect(mockFiles.has(SNAPSHOT_FILE)).toBe(false);

  mockFiles.set(SNAPSHOT_FILE, JSON.stringify({ ...snapshot(), version: 2 }));
  expect(readSessionSnapshot({ sub: "auth0|1", now: NOW })).toBeNull();
});

test("a profile that isn't the snapshot's account is not trusted", () => {
  saveSessionSnapshot(snapshot({ profile: { id: "user-2" } as unknown as User }));

  expect(readSessionSnapshot({ sub: "auth0|1", now: NOW })).toBeNull();
});

test("nothing saved reads as nothing, and removing it twice is harmless", () => {
  expect(readSessionSnapshot({ sub: "auth0|1", now: NOW })).toBeNull();
  saveSessionSnapshot(snapshot());
  removeSessionSnapshot();
  removeSessionSnapshot();
  expect(mockFiles.size).toBe(0);
});
