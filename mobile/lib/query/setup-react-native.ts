import NetInfo from "@react-native-community/netinfo";
import { focusManager, onlineManager } from "@tanstack/react-query";
import { AppState, Platform } from "react-native";
import type { AppStateStatus } from "react-native";

export const setupReactNativeQueryManagers = () => {
  onlineManager.setEventListener((setOnline) => {
    return NetInfo.addEventListener((state) => setOnline(!!state.isConnected));
  });

  const onAppStateChange = (status: AppStateStatus) => {
    if (Platform.OS !== "web") {
      focusManager.setFocused(status === "active");
    }
  };

  const subscription = AppState.addEventListener("change", onAppStateChange);

  return () => subscription.remove();
};
