import { BottomSheet } from "@/components/ui/bottom-sheet/bottom-sheet";
import { ThemedText } from "@/components/ui/themed-text";
import { View } from "react-native";

import { EVENT_ROLE_EXPLAINERS, getAccessLevelLabel } from "../utils";

type EventRolesSheetProps = {
  visible: boolean;
  onClose: () => void;
};

export const EventRolesSheet = ({ visible, onClose }: EventRolesSheetProps) => (
  <BottomSheet
    testID="event-roles-sheet"
    visible={visible}
    onClose={onClose}
    title="Event Roles"
    dismissAccessibilityLabel="Dismiss event roles"
    closeAccessibilityLabel="Close event roles"
  >
    <ThemedText className="text-sm" tone="muted">
      Each invite link grants a different level of access. Pick the role that matches who you're inviting.
    </ThemedText>

    <View className="gap-3">
      {EVENT_ROLE_EXPLAINERS.map((role) => (
        <View key={role.accessLevel} className="gap-1.5 rounded-xl bg-surface p-3">
          <ThemedText className="text-base font-semibold">{getAccessLevelLabel(role.accessLevel)}</ThemedText>
          <ThemedText className="text-sm" tone="muted">
            {role.summary}
          </ThemedText>
          <View className="gap-0.5">
            {role.can.map((line) => (
              <ThemedText key={line} className="text-xs">
                • {line}
              </ThemedText>
            ))}
            {role.cannot.map((line) => (
              <ThemedText key={line} className="text-xs" tone="muted">
                • {line}
              </ThemedText>
            ))}
          </View>
        </View>
      ))}
    </View>
  </BottomSheet>
);
