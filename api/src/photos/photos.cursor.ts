import { BadRequestException } from "@nestjs/common";
import { PHOTO_SERVICE_ERRORS } from "./photos.constants";

/** The sort position a page of photos ends at: the keyset for `createdAt DESC, id DESC`. */
export interface PhotoCursor {
  createdAt: Date;
  id: string;
}

const CURSOR_SEPARATOR = "|";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The cursor carries the sort key itself rather than the id of the last row.
 * Prisma's `cursor: { id }` resolves the row's sort values at query time, so
 * once that row is deleted (a common event for photos) the next page comes
 * back empty and the client believes the list ended. A `(createdAt, id)`
 * keyset in the WHERE clause does not care whether the row still exists, and
 * it uses the `(eventId, status, createdAt)` index directly.
 *
 * Encoded as base64url of `<createdAt ISO>|<id>`. It is opaque to clients:
 * the shape may change, and only `nextCursor` values are guaranteed to decode.
 */
export const encodePhotoCursor = ({ createdAt, id }: PhotoCursor): string =>
  Buffer.from(`${createdAt.toISOString()}${CURSOR_SEPARATOR}${id}`).toString("base64url");

/** Decodes a cursor produced by `encodePhotoCursor`, or rejects the request with 400. */
export const decodePhotoCursor = (cursor: string): PhotoCursor => {
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

  if (!valid) throw new BadRequestException(PHOTO_SERVICE_ERRORS.INVALID_CURSOR);

  return { createdAt, id };
};
