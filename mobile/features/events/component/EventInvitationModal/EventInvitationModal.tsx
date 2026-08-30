import { Button } from "@/components/ui/button";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { Ionicons } from "@expo/vector-icons";
import {
  Alert,
  Clipboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import QRCode from "react-native-qrcode-svg";
import { Event } from "../../types";

type EventInvitationModalProps = {
  visible: boolean;
  onClose: () => void;
  event: Event | null;
};

const EventInvitationModal = ({ visible, onClose, event }: EventInvitationModalProps) => {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";

  if (!event) return null;

  const handleCopyLink = async () => {
    if (event.invitationUrl) {
      Clipboard.setString(event.invitationUrl);
      Alert.alert("Copied!", "Invitation link copied to clipboard");
    }
  };

  const handleShareLink = async () => {
    try {
      await Share.share({
        message: `Join "${event.title}" via ${event.invitationUrl}`,
      });
    } catch (error) {
      console.error("Share failed:", error);
    }
  };

  return (
    <Modal animationType="slide" visible={visible} transparent>
      <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <View style={[styles.modalContent, isDark ? styles.modalContentDark : styles.modalContentLight]}>
          <View style={styles.header}>
            <Text style={[styles.modalTitle, isDark ? styles.textDark : styles.textLight]}>Share Event</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color={isDark ? "#F9FAFB" : "#111827"} />
            </TouchableOpacity>
          </View>

          <View style={[styles.eventInfo, isDark ? styles.eventInfoDark : styles.eventInfoLight]}>
            <Text style={[styles.eventTitle, isDark ? styles.textDark : styles.textLight]}>{event.title}</Text>
            {event.description && (
              <Text
                style={[styles.eventDescription, isDark ? styles.descriptionDark : styles.descriptionLight]}
                numberOfLines={2}
              >
                {event.description}
              </Text>
            )}
          </View>

          <View style={[styles.qrContainer, isDark ? styles.qrContainerDark : styles.qrContainerLight]}>
            <Text style={[styles.sectionTitle, isDark ? styles.textDark : styles.textLight]}>QR Code</Text>
            <View style={styles.qrCodeWrapper}>
              <QRCode
                value={event.invitationUrl}
                size={180}
                backgroundColor={isDark ? "#1F2937" : "#FFFFFF"}
                color={isDark ? "#F9FAFB" : "#111827"}
              />
            </View>
            <Text style={[styles.qrHint, isDark ? styles.subtitleDark : styles.subtitleLight]}>
              Scan to join the event
            </Text>
          </View>

          <View style={styles.linkSection}>
            <Text style={[styles.sectionTitle, isDark ? styles.textDark : styles.textLight]}>Invitation Link</Text>
            <TouchableOpacity
              style={[styles.linkContainer, isDark ? styles.linkContainerDark : styles.linkContainerLight]}
              onPress={handleCopyLink}
            >
              <Text style={[styles.linkText, isDark ? styles.linkTextDark : styles.linkTextLight]} numberOfLines={1}>
                {event.invitationUrl}
              </Text>
              <Ionicons name="copy-outline" size={20} color="#6366F1" />
            </TouchableOpacity>
          </View>

          <View style={styles.modalActions}>
            <Button title="Share Link" onPress={handleShareLink} />
            <View style={styles.modalButtonSpacing} />
            <Button title="Close" onPress={onClose} variant="outline" />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    maxHeight: "90%",
  },
  modalContentLight: {
    backgroundColor: "#FFFFFF",
  },
  modalContentDark: {
    backgroundColor: "#1F2937",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 24,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: "bold",
  },
  closeButton: {
    padding: 4,
  },
  textLight: {
    color: "#111827",
  },
  textDark: {
    color: "#F9FAFB",
  },
  eventInfo: {
    padding: 16,
    borderRadius: 8,
    marginBottom: 24,
    borderWidth: 1,
  },
  eventInfoLight: {
    backgroundColor: "#F9FAFB",
    borderColor: "#D1D5DB",
  },
  eventInfoDark: {
    backgroundColor: "#111827",
    borderColor: "#374151",
  },
  eventTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 8,
  },
  eventDescription: {
    fontSize: 14,
  },
  descriptionLight: {
    color: "#6B7280",
  },
  descriptionDark: {
    color: "#9CA3AF",
  },
  qrContainer: {
    padding: 20,
    borderRadius: 8,
    alignItems: "center",
    marginBottom: 24,
    borderWidth: 1,
  },
  qrContainerLight: {
    backgroundColor: "#FFFFFF",
    borderColor: "#D1D5DB",
  },
  qrContainerDark: {
    backgroundColor: "#1F2937",
    borderColor: "#374151",
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 16,
  },
  qrCodeWrapper: {
    padding: 16,
    borderRadius: 8,
    backgroundColor: "#FFFFFF",
    marginBottom: 12,
  },
  qrHint: {
    fontSize: 14,
    textAlign: "center",
  },
  subtitleLight: {
    color: "#6B7280",
  },
  subtitleDark: {
    color: "#9CA3AF",
  },
  linkSection: {
    marginBottom: 24,
  },
  linkContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    gap: 12,
  },
  linkContainerLight: {
    backgroundColor: "#F9FAFB",
    borderColor: "#D1D5DB",
  },
  linkContainerDark: {
    backgroundColor: "#111827",
    borderColor: "#374151",
  },
  linkText: {
    flex: 1,
    fontSize: 14,
  },
  linkTextLight: {
    color: "#6366F1",
  },
  linkTextDark: {
    color: "#818CF8",
  },
  modalActions: {
    flexDirection: "column",
  },
  modalButtonSpacing: {
    height: 12,
  },
});

export default EventInvitationModal;
