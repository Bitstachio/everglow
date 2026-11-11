import type { Href } from "expo-router";

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

/**
 * The screens a notification may open, and nothing else: a roll, its
 * envelope, its tray, or its reports queue. A path outside these (sign-in,
 * account deletion, a route the app doesn't have) opens nothing.
 */
const ROUTES = [
  new RegExp(`^/events/(${UUID})$`, "i"),
  new RegExp(`^/events/(${UUID})/(?:envelope|tray|reports)$`, "i"),
];

/** The roll a path is in, for /events/<id> and the screens under it. */
export const rollIdOf = (path: string | null | undefined): string | null =>
  path?.match(new RegExp(`^/events/(${UUID})(?:/|$)`, "i"))?.[1]?.toLowerCase() ?? null;

/**
 * Where a tapped notification opens: the `url` the API put in its data, when
 * it is one of ROUTES. Any query string or hash is dropped, so a payload
 * can't pass the screen params of its own (`?arrival=joined`).
 */
export const notificationRoute = (data: unknown): Href | null => {
  if (!data || typeof data !== "object") return null;
  const url = (data as { url?: unknown }).url;
  if (typeof url !== "string") return null;
  const path = url.split(/[?#]/, 1)[0];
  return ROUTES.some((route) => route.test(path)) ? (path as Href) : null;
};
