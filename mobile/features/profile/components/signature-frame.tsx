import sample from "@/assets/images/welcome/birthday-03.jpg";
import { Photo } from "@/components/ui/photo";
import { Text, View } from "react-native";

type SignatureFrameProps = {
  /** The frame number printed before the name, "▸ 142". */
  number: string;
  /** The name as it is signed, or the placeholder before anything is typed. */
  signature: string;
  accessibilityLabel: string;
};

/** A sample frame on its rebate, signed in edge print the way every photo you add will be. */
export const SignatureFrame = ({ number, signature, accessibilityLabel }: SignatureFrameProps) => (
  <View accessible accessibilityRole="image" accessibilityLabel={accessibilityLabel} className="w-61.5">
    <View className="rounded-frame bg-rebate px-2.5 pb-7.5 pt-2.5">
      <Photo source={sample} contentFit="cover" className="h-45 w-full" />
      <Text
        numberOfLines={1}
        className="absolute bottom-2 left-2.5 right-2.5 font-mono text-edge-print uppercase text-edge"
      >
        {`${number} · `}
        <Text className="font-mono-semibold text-text">{signature}</Text>
      </Text>
    </View>
  </View>
);
