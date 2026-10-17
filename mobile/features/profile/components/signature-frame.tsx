import sample from "@/assets/images/welcome/birthday-03.jpg";
import { PencilNote } from "@/components/ui/pencil-note";
import { Photo } from "@/components/ui/photo";
import { useState } from "react";
import { Text, View } from "react-native";

type SignatureFrameProps = {
  /** The frame number printed before the name, "▸ 142". */
  number: string;
  /** The name as it is signed, or the placeholder before anything is typed. */
  signature: string;
  /** A pencil note under the frame with its arrow pointing up at the name. */
  note: string;
  /** Whether the note shows. Its space is always kept, so nothing moves when it appears. */
  showNote: boolean;
  accessibilityLabel: string;
};

// The arrow points at the name's first letter. The name starts at the same
// place whatever is typed, so the note stays put.
const FIRST_LETTER_CENTRE = 4;

/** A sample frame on its rebate, signed in edge print the way every photo you add will be. */
export const SignatureFrame = ({ number, signature, note, showNote, accessibilityLabel }: SignatureFrameProps) => {
  // Where the name starts, measured inside the frame.
  const [nameX, setNameX] = useState<number | null>(null);
  const arrowX = nameX == null ? null : nameX + FIRST_LETTER_CENTRE;

  return (
    <View className="w-61.5">
      <View accessible accessibilityRole="image" accessibilityLabel={accessibilityLabel}>
        <View className="rounded-frame bg-rebate px-2.5 pb-7.5 pt-2.5">
          <Photo source={sample} contentFit="cover" className="h-45 w-full" />
          <View className="absolute bottom-2 left-2.5 right-2.5 flex-row">
            <Text className="font-mono text-edge-print uppercase text-edge">{`${number} · `}</Text>
            <Text
              numberOfLines={1}
              // x is inside the label row, which starts 10pt into the frame.
              onLayout={(event) => setNameX(event.nativeEvent.layout.x + 10)}
              className="shrink font-mono-semibold text-edge-print uppercase text-text"
            >
              {signature}
            </Text>
          </View>
        </View>
      </View>
      <View
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        className="mt-2 w-52 flex-row gap-2 -rotate-3"
        // The arrow glyph is about 12pt wide; centre it under the name once it's measured.
        style={{ marginLeft: (arrowX ?? 0) - 6, opacity: showNote && arrowX != null ? 1 : 0 }}
      >
        <PencilNote>↑</PencilNote>
        <PencilNote className="mt-1.5">{note}</PencilNote>
      </View>
    </View>
  );
};
