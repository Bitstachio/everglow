import type { SheetFrame } from "../../lib/roll-page";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { FlatList, Platform } from "react-native";
import { useReduceMotion } from "@/hooks/use-reduce-motion";
import { fadeDuration } from "./paging";
import { useFramePager } from "./use-frame-pager";

/** Load the next page of the roll this close to its loaded end. */
const LOAD_MORE_WITHIN = 3;

export const useFrameViewer = ({
  index,
  count,
  stripStep,
  width,
  onSelectPage,
  frameId,
  onClose,
  hasMore,
  onLoadMore,
}: {
  index: number;
  count: number;
  stripStep: number;
  width: number;
  onSelectPage: (index: number) => void;
  frameId: string | null;
  onClose: () => void;
  hasMore: boolean;
  onLoadMore: () => void;
}) => {
  const reduceMotion = useReduceMotion();
  const stripRef = useRef<FlatList<SheetFrame>>(null);
  // The strip jumps into place when the viewer opens and glides after that.
  const stripPlaced = useRef(false);
  useEffect(() => {
    if (index < 0) {
      stripPlaced.current = false;
      return;
    }
    stripRef.current?.scrollToOffset({
      offset: Math.max(0, index - 2) * stripStep,
      animated: stripPlaced.current && !reduceMotion,
    });
    stripPlaced.current = true;
  }, [index, stripStep, reduceMotion]);

  const loadMore = useRef(onLoadMore);
  useLayoutEffect(() => {
    loadMore.current = onLoadMore;
  });
  useEffect(() => {
    if (index >= 0 && hasMore && index >= count - LOAD_MORE_WITHIN) loadMore.current();
  }, [index, count, hasMore]);

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

  const requestClose = () => {
    if (closing) return;
    deferred.current = null;
    setMenuVisible(false);
    // iOS keeps rendering children during its native fade. Clear the
    // selected photo only after dismissal, so attribution cannot flicker.
    if (Platform.OS === "ios") {
      closingFrameId.current = frameId;
      setClosing(true);
    } else onClose();
  };

  const pager = useFramePager({
    index,
    count,
    frameId,
    width,
    reduceMotion,
    onSelect: onSelectPage,
    onDismiss: requestClose,
  });

  return {
    stripRef,
    pager,
    fadeMs: fadeDuration(reduceMotion),
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
    closing,
    requestClose,
    onDismiss: () => {
      if (frameId && closingFrameId.current === frameId) {
        closingFrameId.current = null;
        onClose();
      }
    },
  };
};
