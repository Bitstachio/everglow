import { View } from "react-native";

/**
 * The scanner's frame (06.1): four white corners and a small ring in the
 * middle, over the camera. Decorative.
 */
export const Viewfinder = () => (
  <View
    accessibilityElementsHidden
    importantForAccessibility="no-hide-descendants"
    pointerEvents="none"
    className="h-82.5 w-full"
  >
    <View className="absolute left-0 top-0 size-8.5 border-l-2 border-t-2 border-white" />
    <View className="absolute right-0 top-0 size-8.5 border-r-2 border-t-2 border-white" />
    <View className="absolute bottom-0 left-0 size-8.5 border-b-2 border-l-2 border-white" />
    <View className="absolute bottom-0 right-0 size-8.5 border-b-2 border-r-2 border-white" />
    <View className="absolute left-1/2 top-1/2 -ml-2.25 -mt-2.25 size-4.5 rounded-full border-1.5 border-white opacity-80" />
  </View>
);
