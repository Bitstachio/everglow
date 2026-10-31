import type { SheetFrame } from "../../lib/roll-page";
import { useEffect, useMemo, useRef, useState } from "react";
import { FlatList, PanResponder } from "react-native";

export const useFrameViewer = (previous: () => void, next: () => void, index: number, stripStep: number) => {
  const stripRef = useRef<FlatList<SheetFrame>>(null);
  useEffect(() => {
    if (index >= 0) stripRef.current?.scrollToOffset({ offset: Math.max(0, index - 2) * stripStep, animated: false });
  }, [index, stripStep]);
  const [menuVisible, setMenuVisible] = useState(false);
  const deferred = useRef<(() => void) | null>(null);
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
