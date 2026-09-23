import { AppIcon } from "@/components/ui/app-icon";
import { Button } from "@/components/ui/button";
import { H2 } from "@/components/ui/heading";
import { IconButton } from "@/components/ui/icon-button";
import { ThemedText } from "@/components/ui/themed-text";
import { CameraView, useCameraPermissions } from "expo-camera";
import { CameraOff, X } from "lucide-react-native";
import { useState } from "react";
import { Alert, Modal, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type QRScannerProps = {
  visible: boolean;
  onClose: () => void;
  onScan: (data: string) => void;
};

export const QRScanner = ({ visible, onClose, onScan }: QRScannerProps) => {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const insets = useSafeAreaInsets();

  const handleBarCodeScanned = ({ data }: { data: string }) => {
    if (scanned) return;

    setScanned(true);
    onScan(data);
    onClose();

    setTimeout(() => setScanned(false), 500);
  };

  const handleRequestPermission = async () => {
    const result = await requestPermission();
    if (!result.granted) {
      Alert.alert(
        "Camera Permission Required",
        "Please enable camera access in your device settings to scan QR codes.",
      );
    }
  };

  if (!permission) {
    return null;
  }

  if (!permission.granted) {
    return (
      <Modal animationType="slide" visible={visible} transparent>
        <View className="flex-1 items-center justify-center bg-scrim p-4">
          <View className="w-full gap-4 rounded-2xl bg-background p-6">
            <View className="items-center gap-4">
              <AppIcon icon={CameraOff} size="xl" className="text-muted" />
              <H2 className="text-center">Camera Access Required</H2>
              <ThemedText className="text-center text-base" tone="muted">
                We need access to your camera to scan QR codes for event invitations.
              </ThemedText>
            </View>
            <View className="gap-3">
              <Button title="Grant Permission" onPress={handleRequestPermission} />
              <Button title="Cancel" onPress={onClose} variant="outline" />
            </View>
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <Modal animationType="slide" visible={visible} transparent={false}>
      <View className="flex-1 bg-black">
        <CameraView
          className="flex-1"
          facing="back"
          barcodeScannerSettings={{
            barcodeTypes: ["qr"],
          }}
          onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
        >
          <View className="flex-1">
            <View className="px-6 pb-6" style={{ paddingTop: Math.max(insets.top, 24) }}>
              <IconButton accessibilityLabel="Close scanner" onPress={onClose} className="bg-scrim">
                <AppIcon icon={X} size="md" className="text-white" />
              </IconButton>
            </View>

            <View className="flex-1 items-center justify-center">
              <View className="relative h-72 w-72">
                <View className="absolute left-0 top-0 h-10 w-10 rounded-tl-lg border-l-4 border-t-4 border-white" />
                <View className="absolute right-0 top-0 h-10 w-10 rounded-tr-lg border-r-4 border-t-4 border-white" />
                <View className="absolute bottom-0 left-0 h-10 w-10 rounded-bl-lg border-b-4 border-l-4 border-white" />
                <View className="absolute bottom-0 right-0 h-10 w-10 rounded-br-lg border-b-4 border-r-4 border-white" />
              </View>
            </View>

            <View className="px-6" style={{ paddingBottom: Math.max(insets.bottom, 32) }}>
              <ThemedText className="text-center text-base font-medium text-white" tone="foreground">
                Position the QR code within the frame
              </ThemedText>
            </View>
          </View>
        </CameraView>
      </View>
    </Modal>
  );
};
