// Only native/platform boundaries are replaced; feature components stay real.
import type { ComponentProps } from "react";
import type { CameraView } from "expo-camera";

export const mockColorScheme = jest.fn(() => "light");
export const mockRequestPermission = jest.fn();
export const mockCameraPermission = jest.fn((): { granted: boolean } | null => ({ granted: true }));

jest.mock("@/hooks/use-color-scheme", () => ({ useColorScheme: () => mockColorScheme() }));
jest.mock("@expo/vector-icons", () => ({ Ionicons: () => null, MaterialCommunityIcons: () => null }));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("react-native-qrcode-svg", () => {
  const { View } = jest.requireActual("react-native");
  return {
    __esModule: true,
    default: ({ value }: { value: string }) => <View accessibilityLabel={`QR code: ${value}`} />,
  };
});
jest.mock("expo-camera", () => {
  const { View } = jest.requireActual("react-native");
  return {
    useCameraPermissions: () => [mockCameraPermission(), mockRequestPermission],
    CameraView: (props: ComponentProps<typeof CameraView>) => <View {...props} testID="camera" />,
  };
});

// React Native's default mock discards props; retain the native event boundary.
jest.mock("react-native/Libraries/Components/RefreshControl/RefreshControl", () => {
  const { View } = jest.requireActual("react-native");
  return { __esModule: true, default: (props: import("react-native").RefreshControlProps) => <View {...props} /> };
});
