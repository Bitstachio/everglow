import { AppIcon } from "@/components/ui/app-icon";
import { BottomSheet } from "@/components/ui/bottom-sheet/bottom-sheet";
import { IconButton } from "@/components/ui/icon-button";
import { ThemedText } from "@/components/ui/themed-text";
import { Trash2, User } from "lucide-react-native";
import { ScrollView, View } from "react-native";
import type { EventParticipantResponseDto } from "../types";
import { getAccessLevelLabel } from "../utils";

type EventMembersSheetProps = {
  visible: boolean;
  participants: EventParticipantResponseDto[];
  onClose: () => void;
  onRemove: (userId: string) => void;
};

export const EventMembersSheet = ({ visible, participants, onClose, onRemove }: EventMembersSheetProps) => (
  <BottomSheet
    testID="event-members-sheet"
    visible={visible}
    onClose={onClose}
    title="Event Members"
    dismissAccessibilityLabel="Dismiss event members"
    closeAccessibilityLabel="Close event members"
  >
    <ScrollView className="max-h-96">
      <View className="gap-3">
        {participants.map((participant) => (
          <View
            key={participant.userId}
            className="min-h-14 flex-row items-center justify-between gap-3 rounded-2xl border border-border bg-background p-4"
          >
            <View className="flex-1 flex-row items-center gap-3">
              <View className="h-10 w-10 items-center justify-center rounded-full bg-surface">
                <AppIcon icon={User} size="sm" className="text-accent" />
              </View>
              <View className="flex-1 gap-1">
                <ThemedText className="text-base font-semibold">{participant.name || "Unknown User"}</ThemedText>
                {participant.username ? (
                  <ThemedText tone="muted" className="text-sm">
                    @{participant.username}
                  </ThemedText>
                ) : null}
                <View className="self-start rounded-lg bg-surface px-2 py-1">
                  <ThemedText className="text-xs font-medium uppercase" tone="muted">
                    {getAccessLevelLabel(participant.accessLevel)}
                  </ThemedText>
                </View>
              </View>
            </View>
            {participant.accessLevel !== "ORGANIZER" ? (
              <IconButton
                accessibilityLabel={`Remove ${participant.name || "member"}`}
                onPress={() => onRemove(participant.userId)}
                className="bg-surface"
              >
                <AppIcon icon={Trash2} size="sm" className="text-danger" />
              </IconButton>
            ) : null}
          </View>
        ))}
      </View>
    </ScrollView>
  </BottomSheet>
);
