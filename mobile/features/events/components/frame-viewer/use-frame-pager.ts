import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { LayoutChangeEvent } from "react-native";
import { Gesture } from "react-native-gesture-handler";
import {
  ReduceMotion,
  cancelAnimation,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { scheduleOnRN, scheduleOnUI } from "react-native-worklets";
import {
  DISMISS_SHRINK,
  DOUBLE_TAP_ZOOM,
  clampPan,
  dismissProgress,
  doubleTapTranslate,
  dragOffset,
  dragPan,
  focalTranslate,
  nearestIndex,
  pageOffset,
  pageStride,
  pinchScale,
  restingScale,
  settleIndex,
  shouldDismiss,
  snapSpring,
} from "./paging";

const IDLE = 0;
const PAGING = 1;
const DISMISSING = 2;
const PANNING_ZOOM = 3;

/**
 * The frame viewer's pager, on the UI thread. A strip of frames follows the
 * finger 1:1 and springs to a frame on release. The current index is
 * reported back once a swipe passes halfway, so attribution and the film
 * strip keep up with the finger. The current frame can be pinched, double
 * tapped and dragged down to close.
 */
export const useFramePager = ({
  index,
  count,
  frameId,
  width,
  reduceMotion,
  onSelect,
  onDismiss,
}: {
  /** The current frame's index in the roll; -1 while it is leaving. */
  index: number;
  count: number;
  frameId: string | null;
  width: number;
  reduceMotion: boolean;
  /** A swipe made `index` current. */
  onSelect: (index: number) => void;
  onDismiss: () => void;
}) => {
  const stride = pageStride(width);
  const [height, setHeight] = useState(0);
  const position = useSharedValue(pageOffset(Math.max(0, index), stride));
  const start = useSharedValue(0);
  const mode = useSharedValue(IDLE);
  // From the moment a page drag starts until its spring settles.
  const tracking = useSharedValue(false);
  const scale = useSharedValue(1);
  const startScale = useSharedValue(1);
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const focal = useSharedValue({ x: 0, y: 0 });
  // 0 at rest to 1 as the photo is dragged down; the viewer's chrome fades with it.
  const dismiss = useSharedValue(0);
  const dismissX = useSharedValue(0);
  const dismissY = useSharedValue(0);
  const metrics = useSharedValue({ count, stride, width, height, reduceMotion });

  useEffect(() => {
    metrics.set({ count, stride, width, height, reduceMotion });
  }, [metrics, count, stride, width, height, reduceMotion]);

  const settleTarget = useSharedValue(-1);
  const handlers = useRef({ onSelect, onDismiss });
  const committed = useRef(index);
  useLayoutEffect(() => {
    handlers.current = { onSelect, onDismiss };
    committed.current = index;
  });
  const select = (next: number) => {
    if (next !== committed.current) handlers.current.onSelect(next);
  };
  const requestDismiss = () => handlers.current.onDismiss();

  /** Navigation that did not come from this swipe glides there from the adjacent frame. */
  const follow = (target: number) => {
    "worklet";
    // A finger on the strip decides where it goes.
    if (mode.value === PAGING) return;
    const { stride: step, count: total, reduceMotion: still } = metrics.value;
    const near = nearestIndex(position.value, step, total);
    // The selection caught up with this swipe or the frame it is settling on.
    if (tracking.value && (near === target || settleTarget.value === target)) return;
    tracking.set(false);
    // A jump across the roll slides one frame instead of flashing past unmounted ones.
    if (Math.abs(target - near) > 1) position.set(pageOffset(target - Math.sign(target - near), step));
    position.set(withSpring(pageOffset(target, step), { ...snapSpring(still), reduceMotion: ReduceMotion.Never }));
  };

  /** The same frame moved in the list (a new upload above it) or the screen changed size. */
  const shiftBy = (shift: number, target: number) => {
    "worklet";
    if (mode.value === PAGING) {
      start.set(start.value + shift);
      position.set(position.value + shift);
      return;
    }
    cancelAnimation(position);
    tracking.set(false);
    position.set(target);
  };

  const previous = useRef({ frameId, index, stride });
  useEffect(() => {
    const before = previous.current;
    previous.current = { frameId, index, stride };
    if (index < 0 || stride <= 0) return;
    if (before.frameId === null) {
      // Opening the viewer lands on the frame, at rest, without sliding.
      scale.set(1);
      x.set(0);
      y.set(0);
      dismiss.set(0);
      dismissX.set(0);
      dismissY.set(0);
      scheduleOnUI(shiftBy, 0, pageOffset(index, stride));
    } else if (before.frameId !== frameId) {
      // A new frame always starts unzoomed.
      scale.set(1);
      x.set(0);
      y.set(0);
      scheduleOnUI(follow, index);
    } else if (before.index !== index || before.stride !== stride) {
      const target = pageOffset(index, stride);
      scheduleOnUI(shiftBy, target - pageOffset(before.index, before.stride), target);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- follow and shiftBy only read shared values
  }, [frameId, index, stride, scale, x, y, dismiss, dismissX, dismissY]);

  // Report the frame under the middle of the screen as a swipe passes halfway.
  useAnimatedReaction(
    () => nearestIndex(position.value, metrics.value.stride, metrics.value.count),
    (current, last) => {
      // Release already reported the frame the spring is heading for.
      if (last === null || current === last || !tracking.value || current === settleTarget.value) return;
      scheduleOnRN(select, current);
    },
  );

  const resetZoom = () => {
    "worklet";
    const spring = { ...snapSpring(metrics.value.reduceMotion), reduceMotion: ReduceMotion.Never };
    scale.set(withSpring(1, spring));
    x.set(withSpring(0, spring));
    y.set(withSpring(0, spring));
  };

  const settlePage = (velocity: number) => {
    "worklet";
    const { count: total, stride: step, reduceMotion: still } = metrics.value;
    const from = nearestIndex(start.value, step, total);
    const target = settleIndex({ offset: position.value, velocity, from, count: total, stride: step });
    settleTarget.set(target);
    scheduleOnRN(select, target);
    position.set(
      withSpring(
        pageOffset(target, step),
        { ...snapSpring(still), velocity: still ? 0 : velocity, reduceMotion: ReduceMotion.Never },
        (finished) => {
          if (finished) tracking.set(false);
        },
      ),
    );
  };

  const pan = Gesture.Pan()
    .withTestId("frame-viewer-pan")
    .maxPointers(1)
    .minDistance(8)
    .onStart((event) => {
      if (scale.value > 1.01) {
        mode.set(PANNING_ZOOM);
        startX.set(x.value);
        startY.set(y.value);
        return;
      }
      if (event.translationY > Math.abs(event.translationX)) {
        mode.set(DISMISSING);
        return;
      }
      mode.set(PAGING);
      cancelAnimation(position);
      tracking.set(true);
      settleTarget.set(-1);
      start.set(position.value);
    })
    .onUpdate((event) => {
      const { count: total, stride: step, width: across, height: tall } = metrics.value;
      if (mode.value === PAGING) {
        position.set(dragOffset(start.value + event.translationX, total, step, across));
      } else if (mode.value === DISMISSING) {
        dismissX.set(event.translationX);
        dismissY.set(Math.max(0, event.translationY));
        dismiss.set(dismissProgress(event.translationY, tall));
      } else if (mode.value === PANNING_ZOOM) {
        x.set(dragPan(startX.value + event.translationX, across, scale.value));
        y.set(dragPan(startY.value + event.translationY, tall, scale.value));
      }
    })
    // eslint-disable-next-line react-hooks/refs -- gesture callbacks read the handler ref only during touches
    .onEnd((event) => {
      const { width: across, height: tall, reduceMotion: still } = metrics.value;
      const spring = { ...snapSpring(still), reduceMotion: ReduceMotion.Never };
      if (mode.value === PAGING) {
        settlePage(event.velocityX);
      } else if (mode.value === DISMISSING) {
        if (shouldDismiss(event.translationY, event.velocityY)) {
          dismiss.set(withSpring(1, spring));
          scheduleOnRN(requestDismiss);
        } else {
          dismiss.set(withSpring(0, spring));
          dismissX.set(withSpring(0, spring));
          dismissY.set(withSpring(0, spring));
        }
      } else if (mode.value === PANNING_ZOOM) {
        x.set(withSpring(clampPan(x.value, across, scale.value), spring));
        y.set(withSpring(clampPan(y.value, tall, scale.value), spring));
      }
      mode.set(IDLE);
    })
    // eslint-disable-next-line react-hooks/refs -- gesture callbacks read the handler ref only during touches
    .onFinalize(() => {
      // A cancelled drag (another gesture or the system took over) still settles.
      if (mode.value === PAGING) settlePage(0);
      if (mode.value === DISMISSING) {
        const spring = { ...snapSpring(metrics.value.reduceMotion), reduceMotion: ReduceMotion.Never };
        dismiss.set(withSpring(0, spring));
        dismissX.set(withSpring(0, spring));
        dismissY.set(withSpring(0, spring));
      }
      mode.set(IDLE);
    });

  const pinch = Gesture.Pinch()
    .withTestId("frame-viewer-pinch")
    .onStart((event) => {
      const { width: across, height: tall } = metrics.value;
      startScale.set(scale.value);
      startX.set(x.value);
      startY.set(y.value);
      focal.set({ x: event.focalX - across / 2, y: event.focalY - tall / 2 });
    })
    .onUpdate((event) => {
      const next = pinchScale(startScale.value, event.scale);
      scale.set(next);
      x.set(focalTranslate(focal.value.x, startX.value, startScale.value, next));
      y.set(focalTranslate(focal.value.y, startY.value, startScale.value, next));
    })
    .onEnd(() => {
      const { width: across, height: tall, reduceMotion: still } = metrics.value;
      const resting = restingScale(scale.value);
      if (resting <= 1) {
        resetZoom();
        return;
      }
      const spring = { ...snapSpring(still), reduceMotion: ReduceMotion.Never };
      scale.set(withSpring(resting, spring));
      x.set(withSpring(clampPan(x.value, across, resting), spring));
      y.set(withSpring(clampPan(y.value, tall, resting), spring));
    });

  const doubleTap = Gesture.Tap()
    .withTestId("frame-viewer-double-tap")
    .numberOfTaps(2)
    .maxDuration(300)
    .onEnd((event, success) => {
      if (!success) return;
      if (scale.value > 1.01) {
        resetZoom();
        return;
      }
      const { width: across, height: tall, reduceMotion: still } = metrics.value;
      const spring = { ...snapSpring(still), reduceMotion: ReduceMotion.Never };
      scale.set(withSpring(DOUBLE_TAP_ZOOM, spring));
      x.set(withSpring(doubleTapTranslate(event.x - across / 2, across, DOUBLE_TAP_ZOOM), spring));
      y.set(withSpring(doubleTapTranslate(event.y - tall / 2, tall, DOUBLE_TAP_ZOOM), spring));
    });

  const stripStyle = useAnimatedStyle(() => ({ transform: [{ translateX: position.value }] }));
  const chromeStyle = useAnimatedStyle(() => ({ opacity: 1 - dismiss.value }));

  return {
    stride,
    chromeStyle,
    gesture: Gesture.Race(doubleTap, Gesture.Simultaneous(pinch, pan)),
    stripStyle,
    zoom: { scale, x, y, dismissX, dismissY, dismiss },
    onLayout: (event: LayoutChangeEvent) => setHeight(event.nativeEvent.layout.height),
  };
};

type Zoom = ReturnType<typeof useFramePager>["zoom"];

/**
 * Each page's own transform: the current frame follows zoom and dismissal,
 * and a page that stops being current returns to rest instead of keeping the
 * last transform it was given.
 */
export const useFramePageStyle = (zoom: Zoom, active: boolean) =>
  useAnimatedStyle(() => {
    if (!active) return { opacity: 1, transform: [{ translateX: 0 }, { translateY: 0 }, { scale: 1 }] };
    return {
      opacity: 1 - zoom.dismiss.value * 0.4,
      transform: [
        { translateX: zoom.x.value + zoom.dismissX.value },
        { translateY: zoom.y.value + zoom.dismissY.value },
        { scale: zoom.scale.value * (1 - zoom.dismiss.value * DISMISS_SHRINK) },
      ],
    };
  }, [active]);
