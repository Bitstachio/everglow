import { onlineManager } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";

const subscribe = (onChange: () => void) => onlineManager.subscribe(onChange);
const isOnline = () => onlineManager.isOnline();

/**
 * Whether the phone has a network, as React Query sees it (fed by NetInfo in
 * `lib/query/setup-react-native.ts`). While it is false, queries pause instead
 * of failing, so a screen showing saved data can't rely on an error to know.
 */
export const useIsOnline = (): boolean => useSyncExternalStore(subscribe, isOnline, isOnline);
