import { createHash } from "crypto";

/**
 * What a log line names an invite by. An invite token works like a password
 * (anyone holding it can join the event), so logs never carry it; its SHA-256
 * still tells two requests for the same invite apart from two different ones,
 * and matches between the access log's URL and a 404's `errorReason`.
 */
export const inviteTokenHash = (token: string): string => createHash("sha256").update(token).digest("hex");

// GET /events/invites/:token/preview, under any prefix, with or without a query string.
const INVITE_PREVIEW_PATH = /(\/events\/invites\/)([^/?#]+)(?=\/preview(?:[/?#]|$))/;

const decoded = (segment: string): string => {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
};

/**
 * A request URL fit for the logs: an invite token in the path becomes
 * `sha256:<hash>` (the same hash as `inviteTokenHash`, of the token as the
 * route receives it). Everything else is left as it is.
 */
export const redactUrl = (url: string): string =>
  url.replace(
    INVITE_PREVIEW_PATH,
    (_match, prefix: string, token: string) => `${prefix}sha256:${inviteTokenHash(decoded(token))}`,
  );
