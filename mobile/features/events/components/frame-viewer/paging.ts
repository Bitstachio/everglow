/**
 * Pure geometry for the frame viewer's pager and zoom. Every function is a
 * worklet, so gestures call it on the UI thread; tests call it as plain JS.
 * Offsets are the strip's horizontal translation: frame `i` rests at `-i * stride`.
 */

/** Black space between neighbouring frames while they slide, in points. */
export const PAGE_GAP = 16;
/** A release faster than this, in points per second, moves on even after a short drag. */
export const FLICK_VELOCITY = 500;
/** Frames mounted on each side of the current one. */
export const WINDOW_RADIUS = 2;
/** Frames on each side of the current one that load their original. */
export const ORIGINAL_RADIUS = 1;
export const MAX_ZOOM = 4;
export const DOUBLE_TAP_ZOOM = 2.5;
/** A pinch can squeeze or stretch this far past the limits before it springs back. */
export const ZOOM_SLACK = 0.25;
/** A downward drag past this distance, in points, closes the viewer. */
export const DISMISS_DISTANCE = 120;
/** A downward release faster than this, in points per second, closes the viewer. */
export const DISMISS_VELOCITY = 800;
/** How much smaller the photo gets over a full dismissal drag. */
export const DISMISS_SHRINK = 0.35;

export type SpringConfig = {
  damping: number;
  stiffness: number;
  mass: number;
  overshootClamping: boolean;
};

/** Settles like a photo viewer: quick, with a little give. */
const SNAP_SPRING: SpringConfig = { damping: 30, stiffness: 280, mass: 1, overshootClamping: false };
/** Reduce Motion: critically damped and stiff, so nothing overshoots or lingers. */
const STILL_SPRING: SpringConfig = { damping: 60, stiffness: 600, mass: 1, overshootClamping: true };

export const snapSpring = (reduceMotion: boolean): SpringConfig => {
  "worklet";
  return reduceMotion ? STILL_SPRING : SNAP_SPRING;
};

/** Cross-fade from a thumbnail to its original, in milliseconds. */
export const fadeDuration = (reduceMotion: boolean) => {
  "worklet";
  return reduceMotion ? 80 : 200;
};

const clamp = (value: number, min: number, max: number) => {
  "worklet";
  return Math.min(Math.max(value, min), max);
};

export const pageStride = (width: number) => {
  "worklet";
  return width > 0 ? width + PAGE_GAP : 0;
};

export const pageOffset = (index: number, stride: number) => {
  "worklet";
  return index === 0 ? 0 : -index * stride;
};

export const clampIndex = (index: number, count: number) => {
  "worklet";
  return clamp(index, 0, Math.max(0, count - 1));
};

/**
 * iOS-style resistance: each point dragged past an edge moves the content
 * less, approaching `dimension` but never reaching it.
 */
export const rubberBand = (overshoot: number, dimension: number) => {
  "worklet";
  if (dimension <= 0 || overshoot === 0) return 0;
  const distance = Math.abs(overshoot);
  const banded = (1 - 1 / ((distance * 0.55) / dimension + 1)) * dimension;
  return overshoot < 0 ? -banded : banded;
};

/** The strip's offset for a drag, rubber-banding past the first and last frames. */
export const dragOffset = (raw: number, count: number, stride: number, width: number) => {
  "worklet";
  const first = 0;
  const last = pageOffset(Math.max(0, count - 1), stride);
  if (raw > first) return first + rubberBand(raw - first, width);
  if (raw < last) return last + rubberBand(raw - last, width);
  return raw;
};

/** The frame closest to the middle of the screen; it changes once a swipe passes halfway. */
export const nearestIndex = (offset: number, stride: number, count: number) => {
  "worklet";
  if (stride <= 0 || count <= 0) return 0;
  return clampIndex(Math.round(-offset / stride), count);
};

/**
 * Where a released drag settles. A flick moves one frame in its direction
 * from wherever the strip is; a slow release goes to the nearest frame. One
 * swipe never skips more than one frame from where it started.
 */
export const settleIndex = ({
  offset,
  velocity,
  from,
  count,
  stride,
}: {
  offset: number;
  velocity: number;
  from: number;
  count: number;
  stride: number;
}) => {
  "worklet";
  if (stride <= 0 || count <= 0) return 0;
  const progress = -offset / stride;
  let target = Math.round(progress);
  if (velocity <= -FLICK_VELOCITY) target = Math.floor(progress) + 1;
  else if (velocity >= FLICK_VELOCITY) target = Math.ceil(progress) - 1;
  return clampIndex(clamp(target, from - 1, from + 1), count);
};

/** The frames kept mounted around the current one, inclusive. */
export const pageWindow = (index: number, count: number, radius = WINDOW_RADIUS) => {
  "worklet";
  if (count <= 0 || index < 0) return { first: 0, last: -1 };
  return { first: Math.max(0, index - radius), last: Math.min(count - 1, index + radius) };
};

/** Whether a mounted frame loads its original, or only its thumbnail. */
export const loadsOriginal = (page: number, index: number) => {
  "worklet";
  return Math.abs(page - index) <= ORIGINAL_RADIUS;
};

/** A pinch's scale, with some give past 1× and the maximum. */
export const pinchScale = (start: number, factor: number) => {
  "worklet";
  return clamp(start * factor, 1 - ZOOM_SLACK, MAX_ZOOM + ZOOM_SLACK);
};

/** Where a pinch rests once the fingers lift. */
export const restingScale = (scale: number) => {
  "worklet";
  return clamp(scale, 1, MAX_ZOOM);
};

/** How far a photo zoomed to `scale` can move from the centre before its edge shows. */
export const panLimit = (size: number, scale: number) => {
  "worklet";
  return Math.max(0, (size * scale - size) / 2);
};

export const clampPan = (value: number, size: number, scale: number) => {
  "worklet";
  const limit = panLimit(size, scale);
  return clamp(value, -limit, limit);
};

/** Panning a zoomed photo, rubber-banding past its edges. */
export const dragPan = (raw: number, size: number, scale: number) => {
  "worklet";
  const limit = panLimit(size, scale);
  if (raw > limit) return limit + rubberBand(raw - limit, size);
  if (raw < -limit) return -limit + rubberBand(raw + limit, size);
  return raw;
};

/**
 * The translation that keeps the pinch's focal point under the fingers.
 * `focal` and `start` are measured from the centre of the frame.
 */
export const focalTranslate = (focal: number, start: number, startScale: number, scale: number) => {
  "worklet";
  return focal - (focal - start) * (scale / startScale);
};

/** A double tap zooms in on the tapped point, kept inside the photo's edges. */
export const doubleTapTranslate = (point: number, size: number, scale: number) => {
  "worklet";
  return clampPan(-point * (scale - 1), size, scale);
};

/** 0 at rest to 1 when a downward drag is half the frame's height. */
export const dismissProgress = (translationY: number, height: number) => {
  "worklet";
  if (height <= 0) return 0;
  return clamp(translationY / (height / 2), 0, 1);
};

export const shouldDismiss = (translationY: number, velocityY: number) => {
  "worklet";
  return translationY > DISMISS_DISTANCE || (translationY > 0 && velocityY > DISMISS_VELOCITY);
};
