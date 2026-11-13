import { Image } from "expo-image";

/**
 * Forgets every image this phone loaded: thumbnails of other people's photos,
 * covers, avatars. Run when an account leaves the phone, so the next person
 * signed in can't be shown them from the cache. They load again from the API.
 */
export const clearImageCaches = () => {
  for (const clear of [() => Image.clearMemoryCache(), () => Image.clearDiskCache()]) {
    try {
      void clear().catch(() => undefined);
    } catch {
      // No native image module (tests, web): nothing cached to clear.
    }
  }
};
