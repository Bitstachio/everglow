import type { SheetFrame } from "../../lib/roll-page";
import { useEffect, useMemo, useRef, useState } from "react";
import { FlatList, PanResponder, Platform } from "react-native";

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
  const gesture = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, { dx, dy }) => Math.abs(dx) > 20 && Math.abs(dx) > Math.abs(dy) * 1.5,
        onPanResponderRelease: (_, { dx }) => {
          if (dx > 50) previous();
          else if (dx < -50) next();
        },
      }),
    [previous, next],
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
