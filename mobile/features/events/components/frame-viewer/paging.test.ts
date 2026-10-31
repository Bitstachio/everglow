import {
  DISMISS_DISTANCE,
  FLICK_VELOCITY,
  MAX_ZOOM,
  PAGE_GAP,
  clampPan,
  dismissProgress,
  doubleTapTranslate,
  dragOffset,
  dragPan,
  focalTranslate,
  loadsOriginal,
  nearestIndex,
  pageOffset,
  pageStride,
  pageWindow,
  pinchScale,
  restingScale,
  rubberBand,
  settleIndex,
  shouldDismiss,
  snapSpring,
} from "./paging";

const width = 400;
const stride = pageStride(width);
const at = (page: number) => pageOffset(page, stride);

describe("strides and offsets", () => {
  test("neighbours sit one screen plus the gap apart", () => {
    expect(stride).toBe(width + PAGE_GAP);
    expect(at(0)).toBe(0);
    expect(at(3)).toBe(-3 * stride);
    expect(pageStride(0)).toBe(0);
  });
});

describe("nearestIndex", () => {
  test("changes only once the drag passes halfway", () => {
    expect(nearestIndex(at(3) - stride * 0.49, stride, 10)).toBe(3);
    expect(nearestIndex(at(3) - stride * 0.51, stride, 10)).toBe(4);
    expect(nearestIndex(at(3) + stride * 0.51, stride, 10)).toBe(2);
  });

  test("stays inside the roll while rubber-banding past either end", () => {
    expect(nearestIndex(stride, stride, 10)).toBe(0);
    expect(nearestIndex(at(12), stride, 10)).toBe(9);
    expect(nearestIndex(0, 0, 10)).toBe(0);
    expect(nearestIndex(0, stride, 0)).toBe(0);
  });
});

describe("settleIndex", () => {
  const settle = (offset: number, velocity: number, from = 3, count = 10) =>
    settleIndex({ offset, velocity, from, count, stride });

  test("a slow drag past halfway moves on, short of it springs back", () => {
    expect(settle(at(3) - stride * 0.6, -100)).toBe(4);
    expect(settle(at(3) - stride * 0.4, -100)).toBe(3);
    expect(settle(at(3) + stride * 0.6, 100)).toBe(2);
    expect(settle(at(3) + stride * 0.4, 100)).toBe(3);
  });

  test("a flick moves on even after a short drag", () => {
    expect(settle(at(3) - stride * 0.1, -FLICK_VELOCITY)).toBe(4);
    expect(settle(at(3) + stride * 0.1, FLICK_VELOCITY)).toBe(2);
    expect(settle(at(3), -FLICK_VELOCITY * 3)).toBe(4);
  });

  test("a flick against the drag returns to the frame it left", () => {
    expect(settle(at(3) + stride * 0.2, -FLICK_VELOCITY)).toBe(3);
    expect(settle(at(3) - stride * 0.2, FLICK_VELOCITY)).toBe(3);
  });

  test("never skips more than one frame from where the swipe started", () => {
    expect(settle(at(3) - stride * 1.6, -FLICK_VELOCITY * 10)).toBe(4);
    expect(settle(at(3) + stride * 1.6, FLICK_VELOCITY * 10)).toBe(2);
  });

  test("stops at the first and last frames", () => {
    expect(settle(stride * 0.3, FLICK_VELOCITY, 0)).toBe(0);
    expect(settle(at(9) - stride * 0.3, -FLICK_VELOCITY, 9)).toBe(9);
    expect(settle(0, -FLICK_VELOCITY, 0, 1)).toBe(0);
    expect(settle(0, 0, 0, 0)).toBe(0);
  });
});

describe("rubber-banding", () => {
  test("resists more the further it goes and never reaches the screen width", () => {
    const small = rubberBand(50, width);
    const large = rubberBand(400, width);
    expect(small).toBeGreaterThan(0);
    expect(small).toBeLessThan(50);
    expect(large - small).toBeLessThan(400 - 50);
    expect(rubberBand(100_000, width)).toBeLessThan(width);
    expect(rubberBand(-50, width)).toBe(-small);
    expect(rubberBand(0, width)).toBe(0);
    expect(rubberBand(50, 0)).toBe(0);
  });

  test("a drag moves 1:1 inside the roll and rubber-bands past its ends", () => {
    expect(dragOffset(at(2) - 37, 10, stride, width)).toBe(at(2) - 37);
    expect(dragOffset(120, 10, stride, width)).toBe(rubberBand(120, width));
    expect(dragOffset(at(9) - 120, 10, stride, width)).toBe(at(9) - rubberBand(120, width));
    expect(dragOffset(-120, 1, stride, width)).toBe(-rubberBand(120, width));
  });
});

describe("pageWindow", () => {
  test("mounts two frames on each side of the current one", () => {
    expect(pageWindow(500, 1000)).toEqual({ first: 498, last: 502 });
    expect(pageWindow(0, 1000)).toEqual({ first: 0, last: 2 });
    expect(pageWindow(999, 1000)).toEqual({ first: 997, last: 999 });
    expect(pageWindow(0, 1)).toEqual({ first: 0, last: 0 });
  });

  test("mounts nothing for an empty roll or a frame that left it", () => {
    expect(pageWindow(0, 0)).toEqual({ first: 0, last: -1 });
    expect(pageWindow(-1, 5)).toEqual({ first: 0, last: -1 });
  });

  test("loads originals one frame either side and thumbnails beyond", () => {
    expect([498, 499, 500, 501, 502].map((page) => loadsOriginal(page, 500))).toEqual([false, true, true, true, false]);
  });
});

describe("zoom", () => {
  test("a pinch gives a little past its limits and rests inside them", () => {
    expect(pinchScale(1, 0.5)).toBe(0.75);
    expect(pinchScale(2, 10)).toBe(MAX_ZOOM + 0.25);
    expect(restingScale(0.8)).toBe(1);
    expect(restingScale(4.2)).toBe(MAX_ZOOM);
    expect(restingScale(2)).toBe(2);
  });

  test("a zoomed photo pans only as far as its edges, rubber-banding past them", () => {
    expect(clampPan(500, width, 2)).toBe(200);
    expect(clampPan(-500, width, 2)).toBe(-200);
    expect(clampPan(30, width, 1)).toBe(0);
    expect(dragPan(150, width, 2)).toBe(150);
    expect(dragPan(260, width, 2)).toBe(200 + rubberBand(60, width));
    expect(dragPan(-260, width, 2)).toBe(-200 - rubberBand(60, width));
  });

  test("the pinch's focal point stays under the fingers", () => {
    // A point 100pt right of centre, zoomed from 1× to 2×, shifts the photo left by 100pt.
    expect(focalTranslate(100, 0, 1, 2)).toBe(-100);
    expect(focalTranslate(0, 0, 1, 3)).toBe(0);
    // Continuing a pinch from 2× keeps the same point fixed.
    const start = -100;
    expect(focalTranslate(100, start, 2, 4)).toBe(100 - 200 * 2);
  });

  test("a double tap zooms towards the tapped point without showing an edge", () => {
    expect(doubleTapTranslate(100, width, 2.5)).toBe(-150);
    expect(doubleTapTranslate(-190, width, 2.5)).toBe(285);
    expect(doubleTapTranslate(-400, width, 2.5)).toBe(300);
  });
});

describe("dismissal", () => {
  test("progress follows the drag down to half the frame", () => {
    expect(dismissProgress(0, 800)).toBe(0);
    expect(dismissProgress(200, 800)).toBe(0.5);
    expect(dismissProgress(1000, 800)).toBe(1);
    expect(dismissProgress(-50, 800)).toBe(0);
    expect(dismissProgress(100, 0)).toBe(0);
  });

  test("closes after a long drag or a quick downward flick", () => {
    expect(shouldDismiss(DISMISS_DISTANCE + 1, 0)).toBe(true);
    expect(shouldDismiss(20, 1200)).toBe(true);
    expect(shouldDismiss(60, 100)).toBe(false);
    expect(shouldDismiss(-20, 1200)).toBe(false);
  });
});

describe("springs", () => {
  test("Reduce Motion never overshoots", () => {
    expect(snapSpring(true).overshootClamping).toBe(true);
    expect(snapSpring(false).overshootClamping).toBe(false);
  });
});
