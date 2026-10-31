import type { SheetFrame } from "../../lib/roll-page";
import { useEffect, useRef, useState } from "react";
import { FlatList, Platform, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";

export const useFrameViewer = ({
  index,
  stripStep,
  pageWidth,
  onSelectPage,
  frameId,
  onClose,
}: {
  index: number;
  stripStep: number;
  pageWidth: number;
  onSelectPage: (index: number) => void;
  frameId: string | null;
  onClose: () => void;
}) => {
  const stripRef = useRef<FlatList<SheetFrame>>(null);
  const pagerRef = useRef<FlatList<SheetFrame>>(null);
  useEffect(() => {
    if (index >= 0) stripRef.current?.scrollToOffset({ offset: Math.max(0, index - 2) * stripStep, animated: false });
  }, [index, stripStep]);
  // Thumbnail taps, accessible navigation and rotation keep the native pager
  // aligned. A swipe already rests at this offset when its selection commits.
  useEffect(() => {
    if (index >= 0) pagerRef.current?.scrollToOffset({ offset: index * pageWidth, animated: false });
  }, [index, pageWidth]);
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
  return {
    stripRef,
    pagerRef,
    onPageSettled: ({ nativeEvent }: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (closing || pageWidth <= 0) return;
      const page = Math.round(nativeEvent.contentOffset.x / pageWidth);
      if (page !== index) onSelectPage(page);
    },
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
