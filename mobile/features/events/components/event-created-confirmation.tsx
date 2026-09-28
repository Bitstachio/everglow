import { AppIcon } from "@/components/ui/app-icon";
import { Button } from "@/components/ui/button";
import { H2, H3 } from "@/components/ui/heading";
import { ThemedText } from "@/components/ui/themed-text";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { colorTokens } from "@/theme/tokens";
import { Check, Info, Share } from "lucide-react-native";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, View, type LayoutChangeEvent } from "react-native";
import QRCode from "react-native-qrcode-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { AccessLevel, EventResponseDto } from "../types";
import {
  getAccessLevelLabel,
  getInviteRoleHint,
  inviteUrlForRole,
  INVITE_ROLE_TAB_ORDER,
  resolveEventInvites,
} from "../utils";
import { EventRolesSheet } from "./event-roles-sheet";

// QR edge bounds in px. The code grows into whatever height is left on the
// screen, so the whole confirmation fits without scrolling on most phones.
const QR_MIN_SIZE = 120;
const QR_MAX_SIZE = 240;
// p-3 on both sides plus the 1px border around the QR tile.
const QR_TILE_INSET = 26;

type EventCreatedConfirmationProps = {
  event: EventResponseDto;
  onCopyLink: (invitationUrl: string) => void;
  onShare: (invitationUrl: string, accessLevel: AccessLevel) => void;
  onGoToEvent: () => void;
  onShareLater: () => void;
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
  onGoToEvent,
  onShareLater,
}: EventCreatedConfirmationProps) => {
  const colorScheme = useColorScheme();
  const insets = useSafeAreaInsets();
  const [qrSize, setQrSize] = useState<number | null>(null);
  const [selectedRole, setSelectedRole] = useState<AccessLevel>("PARTICIPANT");
  const [rolesSheetVisible, setRolesSheetVisible] = useState(false);

  const availableRoles = useMemo(() => {
    const invites = resolveEventInvites(event);
    return INVITE_ROLE_TAB_ORDER.filter((role) => invites.some((invite) => invite.accessLevel === role));
  }, [event]);

  const activeRole = availableRoles.includes(selectedRole) ? selectedRole : (availableRoles[0] ?? "PARTICIPANT");
  const invitationUrl = inviteUrlForRole(event, activeRole);
  const roleLabel = getAccessLevelLabel(activeRole);

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
          <ThemedText className="text-center text-sm font-semibold" tone="muted">
            Your event is live
          </ThemedText>
          <H2 className="text-center">{event.title}</H2>
          <ThemedText className="text-center text-sm" tone="muted">
            {formatEventDate(event.date)}
          </ThemedText>
        </View>

        <View className="gap-2">
          <View className="flex-row items-center gap-1.5">
            <ThemedText className="text-sm font-semibold" tone="muted">
              Invite as
            </ThemedText>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="About event roles"
              hitSlop={8}
              onPress={() => setRolesSheetVisible(true)}
              className="h-6 w-6 items-center justify-center rounded-full active:opacity-70"
            >
              <AppIcon icon={Info} size="sm" className="text-muted" />
            </Pressable>
          </View>

          <View className="flex-row gap-1.5 rounded-xl bg-surface p-1">
            {availableRoles.map((role) => {
              const selected = role === activeRole;
              return (
                <Pressable
                  key={role}
                  accessibilityRole="tab"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`Invite as ${getAccessLevelLabel(role)}`}
                  onPress={() => setSelectedRole(role)}
                  className={[
                    "h-10 flex-1 items-center justify-center rounded-lg",
                    selected ? "bg-strong" : "bg-transparent",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  <ThemedText
                    className={["text-sm font-semibold", selected ? "text-background" : ""].filter(Boolean).join(" ")}
                    tone={selected ? "foreground" : "muted"}
                  >
                    {getAccessLevelLabel(role)}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>

          <ThemedText className="text-center text-xs" tone="muted">
            {getInviteRoleHint(activeRole)}
          </ThemedText>
        </View>

        <View className="flex-1 items-center gap-3 rounded-2xl border border-border bg-background p-4">
          <View className="w-full gap-2">
            <ThemedText className="text-sm font-semibold" tone="muted">
              Shareable Invitation Link
            </ThemedText>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Copy invitation link"
              onPress={() => onCopyLink(invitationUrl)}
              className="h-12 w-full flex-row items-center gap-3 rounded-xl bg-surface pl-4 pr-2 active:opacity-80"
            >
              <ThemedText className="flex-1 text-sm font-medium" numberOfLines={1}>
                {toDisplayUrl(invitationUrl)}
              </ThemedText>
              <View className="h-9 items-center justify-center rounded-lg border border-accent bg-background px-3">
                <ThemedText className="text-sm font-medium" tone="accent">
                  Copy
                </ThemedText>
              </View>
            </Pressable>
          </View>

          <H3 className="text-center">{roleLabel} QR Code</H3>

          <View
            testID="qr-slot"
            className="min-h-[146px] w-full flex-1 items-center justify-center"
            onLayout={handleQrSlotLayout}
          >
            {qrSize ? (
              <View className="rounded-2xl border border-border bg-background p-3">
                <QRCode
                  value={invitationUrl}
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
        </View>
      </ScrollView>

      <View className="gap-3 px-4 pt-3" style={{ paddingBottom: 16 + insets.bottom }}>
        <Button
          title={`Share ${roleLabel} Invite`}
          icon={Share}
          onPress={() => onShare(invitationUrl, activeRole)}
        />
        <Button title="Go to Event" onPress={onGoToEvent} variant="outline" />
        <Button title="Share later" onPress={onShareLater} variant="ghost" />
      </View>

      <EventRolesSheet visible={rolesSheetVisible} onClose={() => setRolesSheetVisible(false)} />
    </View>
  );
};
