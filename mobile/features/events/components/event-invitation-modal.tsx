import { AppIcon } from "@/components/ui/app-icon";
import { BottomSheet } from "@/components/ui/bottom-sheet/bottom-sheet";
import { Button } from "@/components/ui/button";
import { H3 } from "@/components/ui/heading";
import { ThemedText } from "@/components/ui/themed-text";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { colorTokens } from "@/theme/tokens";
import { Copy } from "lucide-react-native";
import { Alert, Clipboard, Pressable, Share, View } from "react-native";
import QRCode from "react-native-qrcode-svg";
import { Event } from "../types";

type EventInvitationModalProps = {
  visible: boolean;
  onClose: () => void;
  event: Event | null;
};

export const EventInvitationModal = ({ visible, onClose, event }: EventInvitationModalProps) => {
  const colorScheme = useColorScheme();

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
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title="Share Event"
      dismissAccessibilityLabel="Dismiss invitation"
      closeAccessibilityLabel="Close invitation"
    >
      <View className="gap-3 rounded-2xl border border-border bg-surface p-4">
        <H3>{event.title}</H3>
        {event.description ? (
          <ThemedText className="text-sm" tone="muted" numberOfLines={2}>
            {event.description}
          </ThemedText>
        ) : null}
      </View>

      <View className="items-center gap-3 rounded-2xl border border-border bg-background p-4">
        <ThemedText className="text-base font-semibold">QR Code</ThemedText>
        <View className="rounded-2xl bg-background p-4">
          <QRCode
            value={event.invitationUrl}
            size={180}
            backgroundColor={colorTokens[colorScheme].background}
            color={colorTokens[colorScheme].strong}
          />
        </View>
        <ThemedText className="text-center text-sm" tone="muted">
          Scan to join the event
        </ThemedText>
      </View>

      <View className="gap-2">
        <ThemedText className="text-base font-semibold">Invitation Link</ThemedText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Copy invitation link"
          onPress={handleCopyLink}
          className="min-h-12 flex-row items-center justify-between gap-3 rounded-2xl border border-border bg-surface px-4 py-3"
        >
          <ThemedText className="flex-1 text-sm" tone="accent" numberOfLines={1}>
            {event.invitationUrl}
          </ThemedText>
          <AppIcon icon={Copy} size="sm" className="text-accent" />
        </Pressable>
      </View>

      <View className="gap-3">
        <Button title="Share Link" onPress={handleShareLink} />
        <Button title="Close" onPress={onClose} variant="outline" />
      </View>
    </BottomSheet>
  );
};
