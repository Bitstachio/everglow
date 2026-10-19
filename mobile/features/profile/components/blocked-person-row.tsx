import { Button } from "@/components/ui/button";
import { EdgePrint } from "@/components/ui/edge-print";
import { Text, View } from "react-native";

type BlockedPersonRowProps = {
  /** Position in the list, 1-based. */
  number: number;
  /** Their name, or a stand-in when the account has no profile. */
  name: string;
  /** "@handle", when they have one. */
  handle?: string;
  /** In place of a photo, which the list of blocks doesn't have. Empty for an account with no profile. */
  initials: string;
  unblockLabel: string;
  unblockA11y: string;
  onUnblock: () => void;
};

/** 14.8 One blocked person: number, initials, name and handle, Unblock. */
export const BlockedPersonRow = ({
  number,
  name,
  handle,
  initials,
  unblockLabel,
  unblockA11y,
  onUnblock,
}: BlockedPersonRowProps) => (
  <View className="min-h-14 flex-row items-center gap-3 border-b border-line py-2.5">
    <EdgePrint className="w-6 text-outline">{String(number).padStart(2, "0")}</EdgePrint>
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className="size-9 items-center justify-center rounded-frame bg-frame-empty"
    >
      <Text className="font-mono-semibold text-edge-print text-edge">{initials}</Text>
    </View>
    <View className="flex-1">
      <Text numberOfLines={1} className="font-sans-medium text-name text-text">
        {name}
      </Text>
      {handle ? <EdgePrint numberOfLines={1}>{handle}</EdgePrint> : null}
    </View>
    <Button
      title={unblockLabel}
      accessibilityLabel={unblockA11y}
      variant="ghost"
      fullWidth={false}
      // Flush with the rule, as drawn: the ghost button's own padding would inset it.
      className="-mr-2"
      onPress={onUnblock}
    />
  </View>
);
