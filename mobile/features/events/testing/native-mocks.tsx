import type { ComponentProps, ReactNode } from "react";
import type { CameraView } from "expo-camera";

export const mockRequestPermission = jest.fn();
export const mockCameraPermission = jest.fn((): { granted: boolean } | null => ({ granted: true }));

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

// The cover crop's root view installs native gesture handling, which Jest lacks.
jest.mock("react-native-gesture-handler", () => {
  const { View } = jest.requireActual("react-native");
  return { ...jest.requireActual("react-native-gesture-handler"), GestureHandlerRootView: View };
});

// The cropper's gestures need the native worklets runtime. The stand-in
// reports the photo unmoved, as the real one does on layout.
jest.mock("@/components/photo-cropper", () => {
  const { useEffect } = jest.requireActual<typeof import("react")>("react");
  const { View } = jest.requireActual("react-native");
  return {
    PhotoCropper: ({ window, onChange }: ComponentProps<typeof import("@/components/photo-cropper").PhotoCropper>) => {
      useEffect(() => onChange(window, { scale: 1, x: 0, y: 0 }), [window, onChange]);
      return <View testID="photo-cropper" />;
    },
  };
});

export const mockSharePhotos = jest.fn().mockResolvedValue({ success: true });
jest.mock("react-native-share", () => ({
  __esModule: true,
  default: { open: (...args: unknown[]) => mockSharePhotos(...args) },
}));
