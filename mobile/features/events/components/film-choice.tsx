import { EdgePrint } from "@/components/ui/edge-print";
import { FilmBox } from "@/components/ui/film-box";
import type { ReactNode } from "react";
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
  /** "Photos kept until Sat, 14 Nov", once there is a date. */
  removed?: ReactNode;
};

/** Film: how long people can add photos, and when the photos go. */
export const FilmChoice = ({ heading, unit, options, selected, onSelect, removed }: FilmChoiceProps) => (
  <View>
    <EdgePrint className="mb-2.5" numberOfLines={1} adjustsFontSizeToFit>
      {heading}
    </EdgePrint>
    <View accessibilityRole="radiogroup" className="flex-row gap-2">
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
    </View>
    {removed ? <EdgePrint className="mt-3">{removed}</EdgePrint> : null}
  </View>
);
