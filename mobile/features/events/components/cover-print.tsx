import { Photo } from "@/components/ui/photo";
import { Spinner } from "@/components/ui/spinner";
import { colorTokens } from "@/theme/tokens";
import { Image } from "phosphor-react-native";
import { Pressable } from "react-native";

type CoverPrintProps = {
  /** "Add a cover" or "Change the cover". */
  accessibilityLabel: string;
  /** The picked cover, already cropped on the device. */
  uri?: string;
  isPreparing: boolean;
  preparingLabel: string;
  disabled?: boolean;
  onPress: () => void;
};

// The cover's 16:9 in points, small enough to sit beside the roll's name.
const PHOTO = { width: 80, height: 45 };

/**
 * 04.5 The roll's cover, on the label beside its name. Empty, it is a blank
 * frame to tap; picked, it shows the cover cropped at 16:9.
 */
export const CoverPrint = ({
  accessibilityLabel,
  uri,
  isPreparing,
  preparingLabel,
  disabled = false,
  onPress,
}: CoverPrintProps) => (
  <Pressable
    accessibilityRole="button"
    accessibilityLabel={accessibilityLabel}
    accessibilityState={{ disabled, busy: isPreparing }}
    disabled={disabled || isPreparing}
    hitSlop={8}
    onPress={onPress}
    className="items-center justify-center overflow-hidden rounded-frame bg-frame-empty active:opacity-80"
    style={{ width: PHOTO.width, height: PHOTO.height }}
  >
    {isPreparing ? (
      <Spinner label={preparingLabel} />
    ) : uri ? (
      <Photo source={{ uri }} contentFit="cover" className="h-full w-full" />
    ) : (
      <Image size={18} color={colorTokens.edge} />
    )}
  </Pressable>
);
