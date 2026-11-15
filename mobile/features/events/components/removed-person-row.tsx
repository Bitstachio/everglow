import { Button } from "@/components/ui/button";
import { EdgePrint } from "@/components/ui/edge-print";
import { GreasePencil } from "@/components/ui/grease-pencil";
import { useState } from "react";
import { Text, View } from "react-native";

type RemovedPersonRowProps = {
  /** Position in the list, 1-based. */
  number: number;
  /** Their name, or a stand-in when the account has no profile. */
  name: string;
  /** In place of a photo, which the list of removed people doesn't have. */
  initials: string;
  letBackLabel: string;
  letBackA11y: string;
  onLetBack: () => void;
};

/** 11.5 Someone a host removed: their name struck through in pencil, and Let back in. */
export const RemovedPersonRow = ({
  number,
  name,
  initials,
  letBackLabel,
  letBackA11y,
  onLetBack,
}: RemovedPersonRowProps) => {
  // The strike follows the name as drawn, not the whole row.
  const [nameWidth, setNameWidth] = useState(0);
  return (
    <View className="min-h-14 flex-row items-center gap-3 border-b border-line py-2.5">
      <EdgePrint className="w-6">{String(number).padStart(2, "0")}</EdgePrint>
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        className="size-9 items-center justify-center rounded-frame bg-frame-empty"
      >
        <Text className="font-mono-semibold text-edge-print text-edge">{initials}</Text>
      </View>
      <View className="flex-1 flex-row">
        <View className="shrink justify-center">
          <Text
            numberOfLines={1}
            onLayout={(event) => setNameWidth(Math.round(event.nativeEvent.layout.width))}
            className="font-sans-medium text-name text-edge"
          >
            {name}
          </Text>
          {nameWidth > 0 ? (
            <View pointerEvents="none" className="absolute -left-1 -right-1">
              <GreasePencil mark="strike" width={nameWidth + 8} height={10} strokeWidth={2.5} />
            </View>
          ) : null}
        </View>
      </View>
      <Button
        title={letBackLabel}
        accessibilityLabel={letBackA11y}
        variant="ghost"
        fullWidth={false}
        // Flush with the rule, as drawn: the ghost button's own padding would inset it.
        className="-mr-2"
        onPress={onLetBack}
      />
    </View>
  );
};
