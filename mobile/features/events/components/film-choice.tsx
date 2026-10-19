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
  /** "Develops Sat 07.11 · photos removed Sat 14.11". */
  develops: ReactNode;
};

// FilmBox is h-28; the boxes sit gap-2 apart.
const BOX_HEIGHT = 112;
const GAP = 8;
// How far the ring reaches past the box on each side.
const RING_X = 10;
const RING_Y = 12;

/** 04.1 and 04.4 Choose your film: how long people can add photos, and what that means. */
export const FilmChoice = ({ heading, unit, options, selected, onSelect, circled, develops }: FilmChoiceProps) => {
  const [rowWidth, setRowWidth] = useState(0);
  const index = options.findIndex((option) => option.days === selected);
  const boxWidth = options.length ? (rowWidth - GAP * (options.length - 1)) / options.length : 0;

  return (
    <View>
      <EdgePrint className="mb-2.5" numberOfLines={1} adjustsFontSizeToFit>
        {heading}
      </EdgePrint>
      <View
        accessibilityRole="radiogroup"
        className="flex-row gap-2"
        onLayout={(event) => setRowWidth(Math.round(event.nativeEvent.layout.width))}
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
              height={BOX_HEIGHT + 2 * RING_Y}
              seed={index + 2}
              drawOn
            />
          </View>
        ) : null}
      </View>
      <EdgePrint className="mt-3">{develops}</EdgePrint>
    </View>
  );
};
