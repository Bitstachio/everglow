import { BadRequestException } from "@nestjs/common";
import { PAGINATION_ERRORS } from "./pagination.constants";

/** The sort position a page ends at: the keyset for `createdAt DESC, id DESC`. */
export interface KeysetCursor {
  createdAt: Date;
  id: string;
}

export interface KeysetPage<T> {
  items: T[];
  nextCursor: string | null;
}

const CURSOR_SEPARATOR = "|";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Newest first, with the id as tie-break so the order is total. */
export const KEYSET_ORDER_BY: [{ createdAt: "desc" }, { id: "desc" }] = [{ createdAt: "desc" }, { id: "desc" }];

/**
 * The cursor carries the sort key itself rather than the id of the last row.
 * Prisma's `cursor: { id }` resolves the row's sort values at query time, so
 * once that row is deleted (a common event for photos) the next page comes
 * back empty and the client believes the list ended. A `(createdAt, id)`
 * keyset in the WHERE clause does not care whether the row still exists, and
 * it uses an index that ends in `createdAt` directly.
 *
 * Encoded as base64url of `<createdAt ISO>|<id>`. It is opaque to clients:
 * the shape may change, and only `nextCursor` values are guaranteed to decode.
 */
export const encodeKeysetCursor = ({ createdAt, id }: KeysetCursor): string =>
  Buffer.from(`${createdAt.toISOString()}${CURSOR_SEPARATOR}${id}`).toString("base64url");

/** Decodes a cursor produced by `encodeKeysetCursor`, or rejects the request with 400. */
export const decodeKeysetCursor = (cursor: string): KeysetCursor => {
  const decoded = Buffer.from(cursor, "base64url").toString("utf8");
  const [timestamp, id, ...rest] = decoded.split(CURSOR_SEPARATOR);
  const createdAt = new Date(timestamp);

  const valid =
    rest.length === 0 &&
    id !== undefined &&
    UUID_PATTERN.test(id) &&
    !Number.isNaN(createdAt.getTime()) &&
    // Strict: the timestamp must be exactly what we emit, so a hand-built
    // cursor with a lossy or differently formatted date is rejected rather
    // than silently landing on a slightly different page.
    createdAt.toISOString() === timestamp;

  if (!valid) throw new BadRequestException(PAGINATION_ERRORS.INVALID_CURSOR);

  return { createdAt, id };
};

/**
 * WHERE fragments selecting the rows after `cursor` in `KEYSET_ORDER_BY`; none
 * for the first page. Decodes first, so a malformed cursor is a 400 before any
 * query runs rather than an empty page.
 */
export const keysetAfter = (cursor: string | undefined) => {
  if (!cursor) return [];

  const { createdAt, id } = decodeKeysetCursor(cursor);
  return [{ OR: [{ createdAt: { lt: createdAt } }, { createdAt, id: { lt: id } }] }];
};

/** Turns `limit + 1` fetched rows into a page: the extra row only signals that a next page exists. */
export const toKeysetPage = <T extends KeysetCursor>(rows: T[], limit: number): KeysetPage<T> => {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;

  return { items, nextCursor: hasMore ? encodeKeysetCursor(items[items.length - 1]) : null };
};
