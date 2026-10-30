import { Button } from "@/components/ui/button";
import { EdgePrint } from "@/components/ui/edge-print";
import { Text, View } from "react-native";

type RollNoticeProps = {
  /** "Under review" or "Suspended by Everglow". */
  edge: string;
  body: string;
  /** Suspension is a safety matter, so its edge is in pencil (07.11). */
  pencil?: boolean;
  /** "What this means ▸" */
  more?: { title: string; onPress: () => void };
};

/** A note from Everglow while it holds the roll (07.10, 07.11), in plain words. */
export const RollNotice = ({ edge, body, pencil = false, more }: RollNoticeProps) => (
  <View accessible={!more} className="mx-5 mt-5 gap-2 border-b border-t border-outline-soft py-4">
    <EdgePrint tone={pencil ? "pencil" : "text"}>{edge}</EdgePrint>
    <Text className="font-sans text-body text-text-2">{body}</Text>
    {more ? (
      <View className="-ml-2 self-start">
        <Button variant="ghost" fullWidth={false} title={more.title} onPress={more.onPress} />
      </View>
    ) : null}
  </View>
);
