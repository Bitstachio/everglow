/*
 * Geometry for the move-and-scale avatar crop (02.8). The photo is laid out
 * centred on the circle, big enough to cover an area around it (the screen,
 * extended so the circle is its centre); the person then scales it (never
 * below that cover) and moves it, but never far enough to uncover any part
 * of the circle. The crop is the circle's square, in photo pixels.
 */

export type Size = { width: number; height: number };

/** How far the photo is moved from the circle's centre (points) and scaled on top of the cover fit. */
export type CropTransform = { scale: number; x: number; y: number };

export const MAX_CROP_SCALE = 5;

/** The scale that makes the photo cover `area`. */
export const coverScale = (photo: Size, area: Size): number =>
  Math.max(area.width / photo.width, area.height / photo.height);

/** Keeps a scale between the cover fit and MAX_CROP_SCALE. */
export const clampCropScale = (scale: number): number => {
  "worklet";
  return Math.min(Math.max(scale, 1), MAX_CROP_SCALE);
};

/**
 * Keeps an offset from uncovering the circle: the photo's edge, `shown`
 * points wide on that axis, may come no closer than the circle's edge.
 */
export const clampCropOffset = (offset: number, shown: number, radius: number): number => {
  "worklet";
  const limit = Math.max(shown / 2 - radius, 0);
  return Math.min(Math.max(offset, -limit), limit);
};

/** The circle's square in photo pixels, for ImageManipulator's crop. */
export const avatarCropRect = (photo: Size, area: Size, radius: number, { scale, x, y }: CropTransform) => {
  const pointsPerPixel = coverScale(photo, area) * scale;
  const side = Math.min(Math.round((2 * radius) / pointsPerPixel), photo.width, photo.height);
  // The circle's top-left corner, measured from the photo's top-left, in points.
  const left = (photo.width * pointsPerPixel) / 2 - x - radius;
  const top = (photo.height * pointsPerPixel) / 2 - y - radius;
  return {
    originX: Math.min(Math.max(Math.round(left / pointsPerPixel), 0), photo.width - side),
    originY: Math.min(Math.max(Math.round(top / pointsPerPixel), 0), photo.height - side),
    width: side,
    height: side,
  };
};
