import { styled } from "nativewind";
import { SafeAreaView as NativeSafeAreaView } from "react-native-safe-area-context";

// NativeWind maps core React Native views automatically, but this third-party
// native view needs an explicit className-to-style adapter.
export const SafeAreaView = styled(NativeSafeAreaView, { className: "style" });
