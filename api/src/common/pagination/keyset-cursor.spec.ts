import { BadRequestException } from "@nestjs/common";
import { decodeKeysetCursor, encodeKeysetCursor, keysetAfter, toKeysetPage } from "./keyset-cursor";

describe("keyset cursor", () => {
  const id = "bbbbbbbb-1111-4222-8333-bbbbbbbbbbbb";
  const createdAt = new Date("2026-06-10T12:00:00.123Z");

  it("round-trips the sort keyset", () => {
    const cursor = encodeKeysetCursor({ createdAt, id });

    expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeKeysetCursor(cursor)).toEqual({ createdAt, id });
  });

  it("keeps millisecond precision, which the tie-break on id depends on", () => {
    const decoded = decodeKeysetCursor(encodeKeysetCursor({ createdAt, id }));

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
    expect(() => decodeKeysetCursor(cursor)).toThrow(BadRequestException);
  });

  describe("keysetAfter", () => {
    it("adds no filter for the first page", () => {
      expect(keysetAfter(undefined)).toEqual([]);
    });

    it("selects the rows that sort after the cursor", () => {
      expect(keysetAfter(encodeKeysetCursor({ createdAt, id }))).toEqual([
        { OR: [{ createdAt: { lt: createdAt } }, { createdAt, id: { lt: id } }] },
      ]);
    });

    it("rejects a malformed cursor with 400", () => {
      expect(() => keysetAfter("not-a-cursor")).toThrow(BadRequestException);
    });
  });

  describe("toKeysetPage", () => {
    const rows = [1, 2, 3].map((n) => ({ id: `${n}${id.slice(1)}`, createdAt: new Date(createdAt.getTime() - n) }));

    it("returns every row and no cursor when nothing was fetched beyond the limit", () => {
      expect(toKeysetPage(rows, 3)).toEqual({ items: rows, nextCursor: null });
    });

    it("drops the extra row and points the cursor at the last row kept", () => {
      expect(toKeysetPage(rows, 2)).toEqual({ items: rows.slice(0, 2), nextCursor: encodeKeysetCursor(rows[1]) });
    });
  });
});
