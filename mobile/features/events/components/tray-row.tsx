import { EdgePrint } from "@/components/ui/edge-print";
import { colorTokens } from "@/theme/tokens";
import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";

type TrayRowProps = {
  name: string;
  /** "Developed · 149", "2.1 / 3.4 MB", "Waiting". */
  status: ReactNode;
  /** Read out with the name, when `status` isn't plain text. */
  statusLabel: string;
  /** Developed: the status reads in full text colour. */
  done?: boolean;
  /** 08.5: can't be added. The name is struck through in pencil and the status removes it. */
  onRemove?: () => void;
  removeLabel?: string;
  crossed?: boolean;
  actions?: { title: string; accessibilityLabel: string; onPress: () => void }[];
};

/** One file in the tray: its name, and how it's doing in edge print. */
export const TrayRow = ({
  name,
  status,
  statusLabel,
  done = false,
  onRemove,
  removeLabel,
  crossed,
  actions,
}: TrayRowProps) => (
  <View className="min-h-12 border-b border-line py-3">
    <View className="flex-row items-center gap-3">
      <Text
        accessibilityLabel={`${name}, ${statusLabel}`}
        numberOfLines={1}
        className={`flex-1 font-sans-medium text-name ${onRemove || crossed ? "text-text-2 line-through" : "text-text"}`}
        style={onRemove || crossed ? { textDecorationColor: colorTokens.pencil } : undefined}
      >
        {name}
      </Text>
      {onRemove ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={removeLabel}
          onPress={onRemove}
          hitSlop={8}
          className="active:opacity-60"
        >
          <EdgePrint tone="text">{status}</EdgePrint>
        </Pressable>
      ) : (
        <EdgePrint importantForAccessibility="no" accessibilityElementsHidden tone={done ? "text" : "edge"}>
          {status}
        </EdgePrint>
      )}
    </View>
    {actions?.length ? (
      <View className="flex-row justify-end gap-4">
        {actions.map((action) => (
          <Pressable
            key={action.accessibilityLabel}
            accessibilityRole="button"
            accessibilityLabel={action.accessibilityLabel}
            onPress={action.onPress}
            className="min-h-11 justify-center active:opacity-60"
          >
            <EdgePrint tone="text">{action.title}</EdgePrint>
          </Pressable>
        ))}
      </View>
    ) : null}
  </View>
);
