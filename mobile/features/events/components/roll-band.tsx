import { EdgePrint } from "@/components/ui/edge-print";
import { GreasePencil } from "@/components/ui/grease-pencil";
import { useState, type ReactNode } from "react";
import { Pressable, View, type LayoutChangeEvent } from "react-native";

type RollBandProps = {
  /** Storage or frames, on the left. */
  stock: ReactNode;
  /** When it opens, the time left, or why it's held. */
  time: ReactNode;
  /** People on the roll, on the right; opens them when `onPeople` is set. */
  people: ReactNode;
  peopleLabel: string;
  onPeople?: () => void;
  /** Circle the time: before it opens for organizers, and on the last day. */
  circleTime?: boolean;
  /** Circle the storage: the roll is full. */
  circleStock?: boolean;
};

// How far the pencil ring reaches past the time it circles.
const RING_X = 18;
const RING_Y = 12;

/** Edge print, circled in pencil when it's what to look at. */
const Circled = ({ circled, seed, children }: { circled: boolean; seed: number; children: ReactNode }) => {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setSize({ width: Math.round(width), height: Math.round(height) });
  };

  return (
    <View onLayout={circled ? onLayout : undefined}>
      <EdgePrint>{children}</EdgePrint>
      {circled && size.width > 0 ? (
        <View className="absolute" style={{ left: -RING_X, top: -RING_Y }}>
          <GreasePencil
            mark="ring"
            width={size.width + 2 * RING_X}
            height={size.height + 2 * RING_Y}
            strokeWidth={2.5}
            seed={seed}
            drawOn
          />
        </View>
      ) : null}
    </View>
  );
};

/** The band under the roll's name: storage, time left, and people. */
export const RollBand = ({
  stock,
  time,
  people,
  peopleLabel,
  onPeople,
  circleTime = false,
  circleStock = false,
}: RollBandProps) => (
  <View testID="roll-band" className="mt-4 border-t border-b border-outline-soft bg-rebate">
    <View className="min-h-12 flex-row items-center justify-between px-5 py-3">
      <Circled circled={circleStock} seed={5}>
        {stock}
      </Circled>
      <Circled circled={circleTime} seed={7}>
        {time}
      </Circled>
      {onPeople ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={peopleLabel}
          onPress={onPeople}
          hitSlop={12}
          className="active:opacity-60"
        >
          <EdgePrint>{people}</EdgePrint>
        </Pressable>
      ) : (
        <EdgePrint accessibilityLabel={peopleLabel}>{people}</EdgePrint>
      )}
    </View>
  </View>
);
