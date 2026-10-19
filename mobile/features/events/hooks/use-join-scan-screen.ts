import { useCameraPermissions } from "expo-camera";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
// React Native's own Clipboard, as the invite sharing uses: expo-clipboard would need a native rebuild.
import { Clipboard, Linking } from "react-native";
import { extractInvitationToken, looksLikeInvite } from "../lib/invite";

/** The camera as the scanner sees it: still asking, on, or off until Settings turns it on. */
export type CameraState = "checking" | "on" | "off" | "blocked";

/**
 * 06.1 Scan and 06.2 Paste a link. A scanned or pasted envelope replaces the
 * scanner with the envelope itself, so going back from it lands on Home.
 */
export const useJoinScanScreen = () => {
  const [permission, requestPermission] = useCameraPermissions();
  const [torch, setTorch] = useState(false);
  const [pasteVisible, setPasteVisible] = useState(false);
  const [link, setLink] = useState("");
  const [fromClipboard, setFromClipboard] = useState(false);
  // A QR stays in view for many frames: open it once.
  const opened = useRef(false);

  const camera: CameraState = !permission
    ? "checking"
    : permission.granted
      ? "on"
      : permission.canAskAgain
        ? "off"
        : "blocked";

  // Ask once, the first time: the scanner is what this screen is for.
  const undetermined = permission?.status === "undetermined";
  useEffect(() => {
    if (undetermined) void requestPermission();
  }, [undetermined, requestPermission]);

  const openEnvelope = (input: string) => {
    const token = extractInvitationToken(input);
    if (!token || opened.current) return;
    opened.current = true;
    setPasteVisible(false);
    router.replace({ pathname: "/join/[token]", params: { token } });
  };

  return {
    camera,
    torch,
    pasteVisible,
    link,
    fromClipboard,
    canOpenLink: extractInvitationToken(link).length > 0,
    onScanned: ({ data }: { data: string }) => openEnvelope(data),
    onToggleTorch: () => setTorch((on) => !on),
    onAllowCamera: () => void requestPermission(),
    onOpenSettings: () => void Linking.openSettings(),
    onClose: () => (router.canGoBack() ? router.back() : router.replace("/events")),
    // 06.2: offer what's on the clipboard when it looks like an envelope.
    onPasteInstead: async () => {
      setPasteVisible(true);
      const text = await Clipboard.getString().catch(() => "");
      if (looksLikeInvite(text)) {
        setLink(text.trim());
        setFromClipboard(true);
      }
    },
    onChangeLink: (value: string) => {
      setLink(value);
      setFromClipboard(false);
    },
    onOpenLink: () => openEnvelope(link),
    onClosePaste: () => setPasteVisible(false),
  };
};
