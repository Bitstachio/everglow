import type { SheetFrame } from "../../lib/roll-page";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  FlatList,
  PanResponder,
  Platform,
  type GestureResponderEvent,
  type PanResponderGestureState,
} from "react-native";

export const useFrameViewer = ({
  previous,
  next,
  index,
  stripStep,
  frameId,
  onClose,
}: {
  previous: () => void;
  next: () => void;
  index: number;
  stripStep: number;
  frameId: string | null;
  onClose: () => void;
}) => {
  const stripRef = useRef<FlatList<SheetFrame>>(null);
  useEffect(() => {
    if (index >= 0) stripRef.current?.scrollToOffset({ offset: Math.max(0, index - 2) * stripStep, animated: false });
  }, [index, stripStep]);
  const [menuVisible, setMenuVisible] = useState(false);
  const [closing, setClosing] = useState(false);
  const [presentedFrameId, setPresentedFrameId] = useState(frameId);
  const closingFrameId = useRef<string | null>(null);
  const deferred = useRef<(() => void) | null>(null);
  if (presentedFrameId !== frameId) {
    setPresentedFrameId(frameId);
    setClosing(false);
    setMenuVisible(false);
  }
  useEffect(() => {
    closingFrameId.current = null;
    deferred.current = null;
  }, [frameId]);
  const navigation = useRef({ previous, next, frameId });
  useLayoutEffect(() => {
    navigation.current = { previous, next, frameId };
  }, [previous, next, frameId]);
  const swipingFrameId = useRef<string | null>(null);
  const onSwipeStart = useCallback(() => {
    swipingFrameId.current = navigation.current.frameId;
  }, []);
  const onSwipeEnd = useCallback((_: GestureResponderEvent, { dx, dy }: PanResponderGestureState) => {
    if (swipingFrameId.current !== navigation.current.frameId || Math.abs(dx) <= Math.abs(dy) * 1.5) return;
    if (dx > 50) navigation.current.previous();
    else if (dx < -50) navigation.current.next();
  }, []);
  // Keep gesture state across parent refreshes; PanResponder invokes these
  // callbacks only for touch events, never while creating the responder.
  const gesture = useMemo(
    () =>
      // eslint-disable-next-line react-hooks/refs -- the callbacks read refs only during native touch events
      PanResponder.create({
        // Claim the photo touch immediately: iOS may not deliver movement
        // when no view accepted its start. Child retry buttons still win.
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_, { dx, dy }) => Math.abs(dx) > 20 && Math.abs(dx) > Math.abs(dy) * 1.5,
        onPanResponderGrant: onSwipeStart,
        onPanResponderRelease: onSwipeEnd,
      }),
    [onSwipeStart, onSwipeEnd],
  );
  return {
    stripRef,
    closing,
    requestClose: () => {
      if (closing) return;
      deferred.current = null;
      setMenuVisible(false);
      // iOS keeps rendering children during its native fade. Clear the
      // selected photo only after dismissal, so attribution cannot flicker.
      if (Platform.OS === "ios") {
        closingFrameId.current = frameId;
        setClosing(true);
      } else onClose();
    },
    onDismiss: () => {
      if (frameId && closingFrameId.current === frameId) {
        closingFrameId.current = null;
        onClose();
      }
    },
    gesture: gesture.panHandlers,
    menuVisible,
    openMenu: () => setMenuVisible(true),
    closeMenu: () => setMenuVisible(false),
    fromMenu: (action: () => void) => {
      deferred.current = action;
      setMenuVisible(false);
    },
    onMenuClosed: () => {
      const action = deferred.current;
      deferred.current = null;
      action?.();
    },
  };
};
