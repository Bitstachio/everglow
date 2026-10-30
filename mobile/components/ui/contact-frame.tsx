import { useState } from "react";
import { Pressable, View, type LayoutChangeEvent, type PressableProps } from "react-native";
import { EdgePrint, EdgeValue } from "./edge-print";
import { GreasePencil } from "./grease-pencil";
import { RetryingPhoto } from "./retrying-photo";

type ContactFrameProps = Omit<PressableProps, "children"> & {
  /** Photo URL; omit for an empty frame. */
  uri?: string;
  /** Stable identity for this photo variant, independent of URL signatures. */
  cacheKey?: string;
  /** The frame number on the roll. */
  number: number;
  /** Who took it, printed after the number. */
  by?: string;
  /** Circled in pencil while selecting. */
  selected?: boolean;
  /** Ticked in pencil: added since the person last looked. */
  isNew?: boolean;
  accessibilityLabel: string;
};

/**
 * One frame on the contact sheet: a square photo with its number and who took
 * it in edge print underneath. Lay frames out three to a row, 4pt apart, with
 * 14pt between rows (room for the label).
 */
export const ContactFrame = ({
  uri,
  cacheKey,
  number,
  by,
  selected = false,
  isNew = false,
  className = "",
  ...props
}: ContactFrameProps) => {
  const [size, setSize] = useState(0);
  const onLayout = (event: LayoutChangeEvent) => setSize(Math.round(event.nativeEvent.layout.width));

  return (
    <Pressable
      accessibilityRole="imagebutton"
      accessibilityState={{ selected }}
      className={`gap-1 ${className}`.trim()}
      {...props}
    >
      <View onLayout={onLayout} className={`aspect-square w-full ${selected ? "p-2" : ""}`.trim()}>
        <View className="h-full w-full overflow-hidden rounded-frame bg-frame-empty">
          <RetryingPhoto
            testID="contact-frame-photo"
            uri={uri}
            cacheKey={cacheKey}
            contentFit="cover"
            className="h-full w-full"
          />
        </View>
        {selected && size > 0 ? (
          <View className="absolute inset-0">
            <GreasePencil mark="ring" width={size} height={size} seed={number} drawOn />
          </View>
        ) : null}
        {isNew && !selected ? (
          <View className="absolute right-1 top-1">
            <GreasePencil mark="tick" width={22} height={18} strokeWidth={2.5} seed={number} />
          </View>
        ) : null}
      </View>
      <EdgePrint size="frame-label" className="pl-0.5" numberOfLines={1}>
        <EdgeValue>{number}</EdgeValue>
        {by ? ` · ${by}` : ""}
      </EdgePrint>
    </Pressable>
  );
};
