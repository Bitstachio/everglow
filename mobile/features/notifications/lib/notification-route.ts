import type { Href } from "expo-router";

/**
 * Where a tapped notification opens: the `url` the API put in its data, an
 * app path such as /events/<id>. Anything else (a full URL, a missing or
 * malformed value) opens nothing.
 */
export const notificationRoute = (data: unknown): Href | null => {
  if (!data || typeof data !== "object") return null;
  const url = (data as { url?: unknown }).url;
  if (typeof url !== "string" || !url.startsWith("/") || url.startsWith("//")) return null;
  return url as Href;
};
