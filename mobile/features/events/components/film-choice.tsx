import { EdgePrint } from "@/components/ui/edge-print";
import { FilmBox } from "@/components/ui/film-box";
import { GreasePencil } from "@/components/ui/grease-pencil";
import { useState, type ReactNode } from "react";
import { View } from "react-native";

export type FilmOption = { days: number; name: string; accessibilityLabel: string };

type FilmChoiceProps = {
  heading: string;
  /** Edge print under each number, "day roll". */
  unit: string;
  /** The gallery lengths the plan offers, from the API. */
  options: FilmOption[];
  selected: number | null;
  onSelect: (days: number) => void;
  /** Ring the chosen box in pencil, once the host has picked one (04.4). */
  circled: boolean;
  /** "Photos removed Sat 14.11", once there is a date. */
  removed?: ReactNode;
};

// The boxes sit gap-2 apart; spacing renders at 7/8 (EV-165).
const GAP = 7;
// How far the ring reaches past the box on each side.
const RING_X = 10;
const RING_Y = 12;

/** 04.1 and 04.4 Film: how long people can add photos, and when the photos go. */
export const FilmChoice = ({ heading, unit, options, selected, onSelect, circled, removed }: FilmChoiceProps) => {
  // Measured, not taken from the classes, so the ring is centred on the boxes as they render.
  const [row, setRow] = useState({ width: 0, height: 0 });
  const index = options.findIndex((option) => option.days === selected);
  const boxWidth = options.length ? (row.width - GAP * (options.length - 1)) / options.length : 0;

  return (
    <View>
      <EdgePrint className="mb-2.5" numberOfLines={1} adjustsFontSizeToFit>
        {heading}
      </EdgePrint>
      <View
        accessibilityRole="radiogroup"
        className="flex-row gap-2"
        onLayout={(event) => {
          const { width, height } = event.nativeEvent.layout;
          setRow({ width: Math.round(width), height: Math.round(height) });
        }}
      >
        {options.map((option) => (
          <FilmBox
            key={option.days}
            days={option.days}
            name={option.name}
            label={unit}
            selected={option.days === selected}
            accessibilityLabel={option.accessibilityLabel}
            onPress={() => onSelect(option.days)}
          />
        ))}
        {circled && index >= 0 && boxWidth > 0 ? (
          <View
            key={selected}
            pointerEvents="none"
            className="absolute"
            style={{ left: index * (boxWidth + GAP) - RING_X, top: -RING_Y }}
          >
            <GreasePencil
              mark="ring"
              width={Math.round(boxWidth + 2 * RING_X)}
              height={row.height + 2 * RING_Y}
              seed={index + 2}
              drawOn
            />
          </View>
        ) : null}
      </View>
      {removed ? <EdgePrint className="mt-3">{removed}</EdgePrint> : null}
    </View>
  );
};
