import NetInfo from "@react-native-community/netinfo";
import { focusManager, onlineManager } from "@tanstack/react-query";
import { AppState, Platform } from "react-native";
import type { AppStateStatus } from "react-native";

export const setupReactNativeQueryManagers = () => {
  onlineManager.setEventListener((setOnline) => {
    // Unknown (null) right after launch counts as online, so Home doesn't flash "No connection".
    return NetInfo.addEventListener((state) => setOnline(state.isConnected !== false));
  });

  const onAppStateChange = (status: AppStateStatus) => {
    if (Platform.OS !== "web") {
      focusManager.setFocused(status === "active");
    }
  };

  const subscription = AppState.addEventListener("change", onAppStateChange);

  return () => subscription.remove();
};
