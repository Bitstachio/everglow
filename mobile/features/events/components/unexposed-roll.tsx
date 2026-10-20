import { FilmStrip, type StripFrame } from "@/components/ui/film-strip";
import { GreasePencil } from "@/components/ui/grease-pencil";
import { PencilNote } from "@/components/ui/pencil-note";
import { useState } from "react";
import { View, type LayoutChangeEvent } from "react-native";

type UnexposedRollProps = {
  /** Strips of four blank, numbered frames. */
  strips: number;
  /** Crossed out in pencil: the photos are gone (07.9). */
  crossed?: boolean;
  /** A pencil note under the strips, such as "photos removed 21 Sep". */
  note?: string;
  /** Said in full for assistive tech, since the strips are decorative. */
  accessibilityLabel?: string;
};

const stripFrames = (strip: number): StripFrame[] =>
  [1, 2, 3, 4].map((n) => ({ key: `${strip}-${n}`, number: strip * 4 + n }));

/** Blank frames: a roll before it opens, while it's hidden, or after its photos went. */
export const UnexposedRoll = ({ strips, crossed = false, note, accessibilityLabel }: UnexposedRollProps) => {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setSize({ width: Math.round(width), height: Math.round(height) });
  };

  return (
    <View accessible={Boolean(accessibilityLabel)} accessibilityLabel={accessibilityLabel} className="mt-5">
      <View onLayout={crossed ? onLayout : undefined} className="gap-1.5">
        {Array.from({ length: strips }, (_, strip) => (
          <FilmStrip key={strip} frames={stripFrames(strip)} />
        ))}
        {crossed && size.width > 0 ? (
          <View className="absolute left-12 top-4">
            <GreasePencil mark="cross" width={size.width - 96} height={size.height - 32} seed={9} />
          </View>
        ) : null}
      </View>
      {note ? (
        <View className="ml-14 mt-1 self-start -rotate-4">
          <PencilNote>{note}</PencilNote>
        </View>
      ) : null}
    </View>
  );
};
