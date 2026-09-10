import { BadRequestException } from "@nestjs/common";
import { decodePhotoCursor, encodePhotoCursor } from "./photos.cursor";

describe("photo cursor", () => {
  const id = "bbbbbbbb-1111-4222-8333-bbbbbbbbbbbb";
  const createdAt = new Date("2026-06-10T12:00:00.123Z");

  it("round-trips the sort keyset", () => {
    const cursor = encodePhotoCursor({ createdAt, id });

    expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodePhotoCursor(cursor)).toEqual({ createdAt, id });
  });

  it("keeps millisecond precision, which the tie-break on id depends on", () => {
    const decoded = decodePhotoCursor(encodePhotoCursor({ createdAt, id }));

    expect(decoded.createdAt.getTime()).toBe(createdAt.getTime());
  });

  it.each([
    ["not base64 of anything useful", "hello"],
    ["missing id", Buffer.from("2026-06-10T12:00:00.123Z").toString("base64url")],
    ["extra segment", Buffer.from(`2026-06-10T12:00:00.123Z|${id}|extra`).toString("base64url")],
    ["non-uuid id", Buffer.from("2026-06-10T12:00:00.123Z|not-a-uuid").toString("base64url")],
    ["unparseable timestamp", Buffer.from(`yesterday|${id}`).toString("base64url")],
    ["lossy timestamp format", Buffer.from(`2026-06-10T12:00:00Z|${id}`).toString("base64url")],
    ["a bare uuid, the pre-opaque cursor shape", id],
    ["empty", ""],
  ])("rejects %s with 400", (_label, cursor) => {
    expect(() => decodePhotoCursor(cursor)).toThrow(BadRequestException);
  });
});
