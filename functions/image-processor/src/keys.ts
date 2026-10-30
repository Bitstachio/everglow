/** Originals only. Derivative writes must not re-enter this job. */
export const PHOTO_KEY_PREFIX = "photos/";

/** Sibling tree for renditions; kept out of the ObjectCreated photos/ filter. */
export const DERIVED_KEY_PREFIX = "derived/";

export const THUMB_OBJECT_NAME = "thumb.webp";
export const LARGE_OBJECT_NAME = "large.jpg";

export type DerivedKeys = {
  thumb: string;
  large: string;
};

/**
 * Map an original object key to its derivative keys.
 * photos/{userId}/{eventId}/{photoId}
 *   → derived/photos/{userId}/{eventId}/{photoId}/thumb.webp
 *   → derived/photos/{userId}/{eventId}/{photoId}/large.jpg
 */
export const derivedKeysForOriginal = (originalKey: string): DerivedKeys => {
  if (!originalKey.startsWith(PHOTO_KEY_PREFIX)) {
    throw new Error(`expected key under ${PHOTO_KEY_PREFIX}, got ${originalKey}`);
  }

  const base = `${DERIVED_KEY_PREFIX}${originalKey}`;
  return {
    thumb: `${base}/${THUMB_OBJECT_NAME}`,
    large: `${base}/${LARGE_OBJECT_NAME}`,
  };
};
