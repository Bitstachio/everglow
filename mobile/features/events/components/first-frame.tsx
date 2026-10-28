import { EdgePrint } from "@/components/ui/edge-print";
import { GreasePencil } from "@/components/ui/grease-pencil";
import { Photo } from "@/components/ui/photo";
import { Spinner } from "@/components/ui/spinner";
import { colorTokens } from "@/theme/tokens";
import { Image } from "phosphor-react-native";
import { Pressable, Text, View } from "react-native";

type FirstFrameProps = {
  heading: string;
  /** Where the cover shows. */
  hint: string;
  /** "Add one ›" or "Change ›". */
  actionLabel: string;
  accessibilityLabel: string;
  /** The picked cover, already cropped on the device. */
  uri?: string;
  isPreparing: boolean;
  preparingLabel: string;
  disabled?: boolean;
  onPress: () => void;
};

// The frame is w-19.5 by h-16; the ring reaches past it on each side.
const RING_WIDTH = 102;
const RING_HEIGHT = 88;

/** 04.5 First frame: the roll's cover, picked before the roll is loaded and circled once it is. */
export const FirstFrame = ({
  heading,
  hint,
  actionLabel,
  accessibilityLabel,
  uri,
  isPreparing,
  preparingLabel,
  disabled = false,
  onPress,
}: FirstFrameProps) => (
  <View>
    <EdgePrint className="mb-2.5">{heading}</EdgePrint>
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled, busy: isPreparing }}
      disabled={disabled || isPreparing}
      onPress={onPress}
      className="flex-row items-center gap-3 active:opacity-80"
    >
      <View>
        <View className="h-16 w-19.5 items-center justify-center overflow-hidden rounded-frame bg-frame-empty">
          {isPreparing ? (
            <Spinner label={preparingLabel} />
          ) : uri ? (
            <Photo source={{ uri }} contentFit="cover" className="h-full w-full" />
          ) : (
            <Image size={18} color={colorTokens.edge} />
          )}
        </View>
        {uri && !isPreparing ? (
          <View pointerEvents="none" className="absolute -left-3 -top-3">
            <GreasePencil mark="ring" width={RING_WIDTH} height={RING_HEIGHT} seed={5} drawOn />
          </View>
        ) : null}
      </View>
      <View className="flex-1 gap-1">
        <EdgePrint>{hint}</EdgePrint>
        <Text className="font-mono-semibold text-text-button uppercase text-text">{actionLabel}</Text>
      </View>
    </Pressable>
  </View>
);
