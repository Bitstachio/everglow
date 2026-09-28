import type { ComponentProps, ReactNode } from "react";
import type { CameraView } from "expo-camera";

export const mockColorScheme = jest.fn(() => "light");
export const mockRequestPermission = jest.fn();
export const mockCameraPermission = jest.fn((): { granted: boolean } | null => ({ granted: true }));

jest.mock("@/hooks/use-color-scheme", () => ({ useColorScheme: () => mockColorScheme() }));
jest.mock("react-native-safe-area-context", () => {
  const { View } = jest.requireActual<typeof import("react-native")>("react-native");
  return {
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
    SafeAreaView: View,
    SafeAreaProvider: ({ children }: { children: ReactNode }) => children,
  };
});
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
