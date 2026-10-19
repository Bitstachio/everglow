import { Button } from "@/components/ui/button";
import { Display } from "@/components/ui/display";
import { EdgePrint } from "@/components/ui/edge-print";
import { useRef } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import type { CalendarDayState } from "../lib/new-roll";

export type WhenSlipDay = {
  key: string;
  /** The day of the month; null for a blank cell before the 1st. */
  label: string | null;
  state: CalendarDayState;
  accessibilityLabel?: string;
  onPress?: () => void;
};

export type WhenSlipTime = {
  key: string;
  label: string;
  selected: boolean;
  disabled: boolean;
  onPress: () => void;
};

type MonthStep = { accessibilityLabel: string; disabled: boolean; onPress: () => void };

type WhenSlipProps = {
  edge: string;
  /** "November 2026". */
  month: string;
  previous: MonthStep;
  next: MonthStep;
  /** "S M T W T F S". */
  weekdays: readonly string[];
  days: WhenSlipDay[];
  times: WhenSlipTime[];
  /** "Set Sat 7 Nov, 19:00". */
  setLabel: string;
  onSet: () => void;
};

// Each time is w-20 with gap-2.5, so four fill the slip and the chosen one sits second.
const TIME_STEP = 90;

const DAY_CLASSES: Record<CalendarDayState, { cell: string; text: string }> = {
  open: { cell: "", text: "text-text" },
  selected: { cell: "rounded-paper bg-leader", text: "text-on-leader" },
  window: { cell: "bg-sprocket", text: "text-text" },
  unavailable: { cell: "", text: "text-outline-soft" },
};

const StepButton = ({ glyph, step }: { glyph: string; step: MonthStep }) => (
  <Pressable
    accessibilityRole="button"
    accessibilityLabel={step.accessibilityLabel}
    accessibilityState={{ disabled: step.disabled }}
    disabled={step.disabled}
    hitSlop={12}
    onPress={step.onPress}
    className={`px-2 active:opacity-60 ${step.disabled ? "opacity-30" : ""}`.trim()}
  >
    <EdgePrint>{glyph}</EdgePrint>
  </Pressable>
);

/**
 * 04.3 When it happens: a month of days, the days the roll stays open after
 * the chosen one shaded, and a row of times. Put it in a `BottomSheet`.
 */
export const WhenSlip = ({ edge, month, previous, next, weekdays, days, times, setLabel, onSet }: WhenSlipProps) => {
  const timesRef = useRef<ScrollView>(null);
  const selectedTime = Math.max(
    0,
    times.findIndex((time) => time.selected),
  );

  return (
    <View>
      <EdgePrint className="mb-2">{edge}</EdgePrint>
      <View className="mb-3 mt-0.5 flex-row items-baseline justify-between">
        <Display variant="slip">{month}</Display>
        <View className="flex-row gap-2">
          <StepButton glyph="‹" step={previous} />
          <StepButton glyph="›" step={next} />
        </View>
      </View>

      <View className="flex-row flex-wrap gap-y-1.5">
        {weekdays.map((weekday, i) => (
          <View key={`weekday-${i}`} className="h-5.5 w-1/7 items-center justify-center">
            <EdgePrint size="frame-label">{weekday}</EdgePrint>
          </View>
        ))}
        {days.map((day) => {
          const classes = DAY_CLASSES[day.state];
          return day.label === null ? (
            <View key={day.key} className="h-9.5 w-1/7" />
          ) : (
            <Pressable
              key={day.key}
              accessibilityRole="button"
              accessibilityLabel={day.accessibilityLabel}
              accessibilityState={{ selected: day.state === "selected", disabled: day.state === "unavailable" }}
              disabled={day.state === "unavailable"}
              onPress={day.onPress}
              className={`h-9.5 w-1/7 items-center justify-center ${classes.cell}`.trim()}
            >
              <Text className={`font-mono text-body ${classes.text}`}>{day.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <ScrollView
        ref={timesRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        className="-mx-5 mt-3.5"
        contentContainerClassName="gap-2.5 px-5"
        onLayout={() => timesRef.current?.scrollTo({ x: Math.max(0, selectedTime - 1) * TIME_STEP, animated: false })}
      >
        {times.map((time) => (
          <Pressable
            key={time.key}
            accessibilityRole="button"
            accessibilityLabel={time.label}
            accessibilityState={{ selected: time.selected, disabled: time.disabled }}
            disabled={time.disabled}
            onPress={time.onPress}
            className={[
              "h-13.5 w-20 items-center justify-center rounded-paper",
              time.selected ? "border-2 border-text" : "border border-outline-soft",
              time.disabled ? "opacity-30" : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            <Text className="font-mono-semibold text-wordmark text-text">{time.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <View className="mt-4">
        <Button title={setLabel} mark="✓" onPress={onSet} />
      </View>
    </View>
  );
};
