import { useState } from "react";
import { Pressable, View, type LayoutChangeEvent, type PressableProps } from "react-native";
import { EdgePrint, EdgeValue } from "./edge-print";
import { GreasePencil } from "./grease-pencil";
import { Photo } from "./photo";

type ContactFrameProps = Omit<PressableProps, "children"> & {
  /** Photo URL; omit for an empty frame. */
  uri?: string;
  /** The frame number on the roll. */
  number: number;
  /** Who took it, printed after the number. */
  by?: string;
  /** Circled in pencil while selecting. */
  selected?: boolean;
  /** Ticked in pencil: added since the person last looked. */
  isNew?: boolean;
  /**
   * Still developing, from 0 (just picked) to 1 (on the roll): a warm blur that
   * sharpens as the upload goes (08.2). Omit for a frame that's on the roll.
   */
  develop?: number;
  /** Crossed out in pencil and darkened: it didn't make it (08.4, 08.8). */
  crossed?: boolean;
  accessibilityLabel: string;
};

// How soft and how warm a frame starts out before it develops.
const MAX_BLUR = 18;
const MAX_CAST = 0.55;

/** The blur and warm cast of a photo `amount` of the way developed (0 to 1). */
export const developLook = (amount: number) => {
  const left = 1 - Math.max(0, Math.min(1, amount));
  return { blurRadius: Math.round(MAX_BLUR * left), castOpacity: MAX_CAST * left };
};

/**
 * One frame on the contact sheet: a square photo with its number and who took
 * it in edge print underneath. Lay frames out three to a row, 4pt apart, with
 * 14pt between rows (room for the label).
 */
export const ContactFrame = ({
  uri,
  number,
  by,
  selected = false,
  isNew = false,
  develop,
  crossed = false,
  className = "",
  ...props
}: ContactFrameProps) => {
  const [size, setSize] = useState(0);
  const amount = Math.max(0, Math.min(1, develop ?? 1));
  const developing = !crossed && amount < 1;
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
          {uri ? (
            <Photo
              source={{ uri }}
              contentFit="cover"
              blurRadius={developing ? developLook(amount).blurRadius : undefined}
              className="h-full w-full"
            />
          ) : null}
          {developing ? (
            <View
              testID="frame-developing"
              className="absolute inset-0 bg-developer"
              style={{ opacity: developLook(amount).castOpacity }}
            />
          ) : null}
          {crossed ? <View testID="frame-crossed" className="absolute inset-0 bg-scrim" /> : null}
        </View>
        {crossed && size > 0 ? (
          <View className="absolute inset-0">
            <GreasePencil mark="cross" width={size} height={size} seed={number} drawOn />
          </View>
        ) : null}
        {selected && size > 0 ? (
          <View className="absolute inset-0">
            <GreasePencil mark="ring" width={size} height={size} seed={number} drawOn />
          </View>
        ) : null}
        {isNew && !selected && !crossed ? (
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
