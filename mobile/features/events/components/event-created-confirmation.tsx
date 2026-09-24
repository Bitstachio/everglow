import { AppIcon } from "@/components/ui/app-icon";
import { Button } from "@/components/ui/button";
import { H2, H3 } from "@/components/ui/heading";
import { ThemedText } from "@/components/ui/themed-text";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { colorTokens } from "@/theme/tokens";
import { Check, Plus, Share } from "lucide-react-native";
import { useState } from "react";
import { Pressable, ScrollView, View, type LayoutChangeEvent } from "react-native";
import QRCode from "react-native-qrcode-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { EventResponseDto } from "../types";

// QR edge bounds in px. The code grows into whatever height is left on the
// screen, so the whole confirmation fits without scrolling on most phones.
const QR_MIN_SIZE = 120;
const QR_MAX_SIZE = 240;
// p-3 on both sides plus the 1px border around the QR tile.
const QR_TILE_INSET = 26;

type EventCreatedConfirmationProps = {
  event: EventResponseDto;
  onCopyLink: () => void;
  onShare: () => void;
  onCreateAnother: () => void;
  onDone: () => void;
};

const formatEventDate = (iso: string) => {
  const date = new Date(iso);
  const day = date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  const time = date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `${day} · ${time}`;
};

const toDisplayUrl = (url: string) => url.replace(/^https?:\/\//, "");

export const EventCreatedConfirmation = ({
  event,
  onCopyLink,
  onShare,
  onCreateAnother,
  onDone,
}: EventCreatedConfirmationProps) => {
  const colorScheme = useColorScheme();
  const insets = useSafeAreaInsets();
  const [qrSize, setQrSize] = useState<number | null>(null);

  const handleQrSlotLayout = ({ nativeEvent: { layout } }: LayoutChangeEvent) => {
    const available = Math.min(layout.width, layout.height) - QR_TILE_INSET;
    setQrSize(Math.round(Math.min(QR_MAX_SIZE, Math.max(QR_MIN_SIZE, available))));
  };

  return (
    <View className="flex-1 bg-background">
      <ScrollView
        className="flex-1"
        contentContainerClassName="grow gap-6 px-4 pb-6 pt-6"
        bounces={false}
        showsVerticalScrollIndicator={false}
      >
        <View className="items-center gap-2">
          <View className="h-14 w-14 items-center justify-center rounded-full bg-accent">
            <AppIcon icon={Check} size="md" className="text-accent-foreground" />
          </View>
          <H2 className="text-center">Your event is live</H2>
          <ThemedText className="text-center text-sm" tone="muted">
            Share the link or let guests scan the code to join and add photos.
          </ThemedText>
        </View>

        <View className="flex-1 items-center gap-3 rounded-2xl border border-border bg-background p-4">
          <View className="items-center gap-1">
            <H3 className="text-center">{event.title}</H3>
            <ThemedText className="text-center text-sm" tone="muted">
              {formatEventDate(event.date)}
            </ThemedText>
          </View>

          <View
            testID="qr-slot"
            className="w-full flex-1 items-center justify-center"
            style={{ minHeight: QR_MIN_SIZE + QR_TILE_INSET }}
            onLayout={handleQrSlotLayout}
          >
            {qrSize ? (
              <View className="rounded-2xl border border-border bg-background p-3">
                <QRCode
                  value={event.invitationUrl}
                  size={qrSize}
                  backgroundColor={colorTokens[colorScheme].background}
                  color={colorTokens[colorScheme].strong}
                />
              </View>
            ) : null}
          </View>

          <ThemedText className="text-center text-xs" tone="subtle">
            Point a camera at the code to join
          </ThemedText>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Copy invitation link"
            onPress={onCopyLink}
            className="h-12 w-full flex-row items-center gap-3 rounded-xl bg-surface pl-4 pr-2 active:opacity-80"
          >
            <ThemedText className="flex-1 text-sm font-medium" numberOfLines={1}>
              {toDisplayUrl(event.invitationUrl)}
            </ThemedText>
            <View className="h-9 items-center justify-center rounded-lg border border-accent bg-background px-3">
              <ThemedText className="text-sm font-medium" tone="accent">
                Copy
              </ThemedText>
            </View>
          </Pressable>
        </View>
      </ScrollView>

      <View className="gap-3 px-4 pt-3" style={{ paddingBottom: 16 + insets.bottom }}>
        <Button title="Share event" icon={Share} onPress={onShare} />
        <Button title="Create another" icon={Plus} onPress={onCreateAnother} variant="outline" />
        <Button title="Done" onPress={onDone} variant="ghost" />
      </View>
    </View>
  );
};
