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
  unblockLabel: string;
  unblockA11y: string;
  onUnblock: () => void;
  disabled?: boolean;
};

/** Up to two initials: the list of blocks has no photos. */
export const initials = (name: string): string =>
  name
    .replace(/^@/, "")
    .split(/[\s._]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");

/** 14.8 One blocked person: number, initials, name and handle, Unblock. */
export const BlockedPersonRow = ({
  number,
  name,
  handle,
  unblockLabel,
  unblockA11y,
  onUnblock,
  disabled = false,
}: BlockedPersonRowProps) => (
  <View className="min-h-14 flex-row items-center gap-3 border-b border-line py-2.5">
    <EdgePrint className="w-6">{String(number).padStart(2, "0")}</EdgePrint>
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className="size-9 items-center justify-center rounded-frame bg-frame-empty"
    >
      <Text className="font-mono-semibold text-edge-print text-edge">{initials(name)}</Text>
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
      onPress={onUnblock}
      disabled={disabled}
    />
  </View>
);
