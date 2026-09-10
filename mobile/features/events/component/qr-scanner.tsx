import { CameraView, useCameraPermissions } from "expo-camera";
import { useState } from "react";
import { Alert, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useColorScheme } from "@/hooks/use-color-scheme";

type QRScannerProps = {
  visible: boolean;
  onClose: () => void;
  onScan: (data: string) => void;
};

const QRScanner = ({ visible, onClose, onScan }: QRScannerProps) => {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";

  const handleBarCodeScanned = ({ data }: { data: string }) => {
    if (scanned) return;

    setScanned(true);
    onScan(data);
    onClose();

    // Reset scanned state after closing
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
        <View style={styles.container}>
          <View
            style={[
              styles.permissionContainer,
              isDark ? styles.permissionContainerDark : styles.permissionContainerLight,
            ]}
          >
            <MaterialCommunityIcons name="camera-off" size={64} color={isDark ? "#9CA3AF" : "#6B7280"} />
            <Text style={[styles.permissionTitle, isDark ? styles.textDark : styles.textLight]}>
              Camera Access Required
            </Text>
            <Text style={[styles.permissionMessage, isDark ? styles.textMuted : styles.textMutedLight]}>
              We need access to your camera to scan QR codes for event invitations.
            </Text>
            <Pressable style={styles.permissionButton} onPress={handleRequestPermission}>
              <Text style={styles.permissionButtonText}>Grant Permission</Text>
            </Pressable>
            <Pressable onPress={onClose} style={styles.cancelButton}>
              <Text style={[styles.cancelButtonText, isDark ? styles.textDark : styles.textLight]}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <Modal animationType="slide" visible={visible} transparent={false}>
      <View style={styles.scannerContainer}>
        <CameraView
          style={styles.camera}
          facing="back"
          barcodeScannerSettings={{
            barcodeTypes: ["qr"],
          }}
          onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
        >
          <View style={styles.overlay}>
            {/* Header */}
            <View style={styles.header}>
              <Pressable onPress={onClose} style={styles.closeButton}>
                <MaterialCommunityIcons name="close" size={28} color="#FFFFFF" />
              </Pressable>
            </View>

            {/* Scanning frame */}
            <View style={styles.scanFrame}>
              <View style={styles.frameContainer}>
                {/* Corner indicators */}
                <View style={[styles.corner, styles.cornerTopLeft]} />
                <View style={[styles.corner, styles.cornerTopRight]} />
                <View style={[styles.corner, styles.cornerBottomLeft]} />
                <View style={[styles.corner, styles.cornerBottomRight]} />
              </View>
            </View>

            {/* Instructions */}
            <View style={styles.instructions}>
              <Text style={styles.instructionText}>Position the QR code within the frame</Text>
            </View>
          </View>
        </CameraView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  permissionContainer: {
    borderRadius: 16,
    padding: 24,
    alignItems: "center",
    gap: 16,
    width: "100%",
    maxWidth: 400,
  },
  permissionContainerLight: {
    backgroundColor: "#FFFFFF",
  },
  permissionContainerDark: {
    backgroundColor: "#1F2937",
  },
  permissionTitle: {
    fontSize: 20,
    fontWeight: "bold",
    textAlign: "center",
  },
  permissionMessage: {
    fontSize: 16,
    textAlign: "center",
    lineHeight: 24,
  },
  permissionButton: {
    backgroundColor: "#3B82F6",
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    width: "100%",
    marginTop: 8,
  },
  permissionButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
  },
  cancelButton: {
    paddingVertical: 12,
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
  },
  textLight: {
    color: "#111827",
  },
  textDark: {
    color: "#F9FAFB",
  },
  textMutedLight: {
    color: "#6B7280",
  },
  textMuted: {
    color: "#9CA3AF",
  },
  scannerContainer: {
    flex: 1,
    backgroundColor: "#000000",
  },
  camera: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    backgroundColor: "transparent",
  },
  header: {
    paddingTop: 60,
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  closeButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  scanFrame: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  frameContainer: {
    width: 280,
    height: 280,
    position: "relative",
  },
  corner: {
    position: "absolute",
    width: 40,
    height: 40,
    borderColor: "#FFFFFF",
    borderWidth: 4,
  },
  cornerTopLeft: {
    top: 0,
    left: 0,
    borderRightWidth: 0,
    borderBottomWidth: 0,
    borderTopLeftRadius: 8,
  },
  cornerTopRight: {
    top: 0,
    right: 0,
    borderLeftWidth: 0,
    borderBottomWidth: 0,
    borderTopRightRadius: 8,
  },
  cornerBottomLeft: {
    bottom: 0,
    left: 0,
    borderRightWidth: 0,
    borderTopWidth: 0,
    borderBottomLeftRadius: 8,
  },
  cornerBottomRight: {
    bottom: 0,
    right: 0,
    borderLeftWidth: 0,
    borderTopWidth: 0,
    borderBottomRightRadius: 8,
  },
  instructions: {
    paddingBottom: 80,
    paddingHorizontal: 24,
  },
  instructionText: {
    color: "#FFFFFF",
    fontSize: 16,
    textAlign: "center",
    fontWeight: "500",
  },
});

export default QRScanner;
