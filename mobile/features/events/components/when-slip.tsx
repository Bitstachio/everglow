import { AppIcon } from "@/components/ui/app-icon";
import { Button } from "@/components/ui/button";
import { Display } from "@/components/ui/display";
import { EdgePrint } from "@/components/ui/edge-print";
import { IconButton } from "@/components/ui/icon-button";
import { useReduceMotion } from "@/hooks/use-reduce-motion";
import { colorTokens } from "@/theme/tokens";
import { CaretLeft, CaretRight, type Icon } from "phosphor-react-native";
import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, Text, useWindowDimensions, View } from "react-native";
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

export type WhenSlipMonth = {
  key: string;
  /** "November 2026". */
  title: string;
  days: WhenSlipDay[];
};

type MonthStep = { accessibilityLabel: string; disabled: boolean };

type WhenSlipProps = {
  edge: string;
  /** Every month a roll can happen in, in order. */
  months: WhenSlipMonth[];
  /** The month on show. */
  monthIndex: number;
  /** A swipe or an arrow brought another month on. */
  onMonthChange: (index: number) => void;
  previous: MonthStep;
  next: MonthStep;
  /** "S M T W T F S". */
  weekdays: readonly string[];
  times: WhenSlipTime[];
  /** "Set Sat 7 Nov, 19:00". */
  setLabel: string;
  onSet: () => void;
};

// Four times fill the slip's width, 10pt apart inside its 20pt margins, and
// the chosen one opens second from the left.
const TIMES_IN_VIEW = 4;
const TIME_GAP = 10;
const TIME_MARGIN = 20;

const DAY_CLASSES: Record<CalendarDayState, { cell: string; text: string }> = {
  open: { cell: "", text: "text-text" },
  selected: { cell: "rounded-paper bg-leader", text: "text-on-leader" },
  window: { cell: "bg-sprocket", text: "text-text" },
  unavailable: { cell: "", text: "text-outline-soft" },
};

// Every month takes six rows, so the slip keeps its height as the months turn.
const CELLS = 6 * 7;
const padToSixWeeks = (days: WhenSlipDay[]): WhenSlipDay[] => [
  ...days,
  ...Array.from({ length: Math.max(CELLS - days.length, 0) }, (_, i) => ({
    key: `pad-${i}`,
    label: null,
    state: "open" as const,
  })),
];

const StepButton = ({ icon, step, onPress }: { icon: Icon; step: MonthStep; onPress: () => void }) => (
  <IconButton accessibilityLabel={step.accessibilityLabel} disabled={step.disabled} onPress={onPress}>
    <AppIcon icon={icon} size="sm" color={colorTokens.text} />
  </IconButton>
);

// Each month spans the sheet edge to edge with the sheet's own margins inside,
// so its days line up under the weekdays and months part with a gap as they pass.
const MonthGrid = ({ days, width }: { days: WhenSlipDay[]; width: number }) => (
  <View style={{ width }} className="flex-row flex-wrap gap-y-1.5 px-5">
    {padToSixWeeks(days).map((day) => {
      const classes = DAY_CLASSES[day.state];
      return day.label === null ? (
        <View key={day.key} testID="when-slip-blank" className="h-9.5 w-1/7" />
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
);

/**
 * 04.3 When it happens: a month of days, the days the roll stays open after
 * the chosen one shaded, and a row of times. Put it in a `BottomSheet`.
 */
export const WhenSlip = ({
  edge,
  months,
  monthIndex,
  onMonthChange,
  previous,
  next,
  weekdays,
  times,
  setLabel,
  onSet,
}: WhenSlipProps) => {
  const reduceMotion = useReduceMotion();
  // The months sit side by side in a paged strip, so a part swipe shows the next one coming in.
  const monthsRef = useRef<ScrollView>(null);
  // The strip spans the sheet, which spans the screen; layout confirms it.
  const [pageWidth, setPageWidth] = useState(useWindowDimensions().width);
  // The month the strip is showing; it follows the swipe and turns past halfway.
  const page = useRef(monthIndex);
  // Only a drag or an arrow turns the month; the strip being put in place doesn't.
  const following = useRef(false);
  const timesRef = useRef<ScrollView>(null);
  const [timeWidth, setTimeWidth] = useState(0);
  const selectedTime = Math.max(
    0,
    times.findIndex((time) => time.selected),
  );

  // Bring the chosen month on when it changes from outside the strip, such as when the slip opens.
  useEffect(() => {
    if (!pageWidth || page.current === monthIndex) return;
    page.current = monthIndex;
    following.current = false;
    monthsRef.current?.scrollTo({ x: monthIndex * pageWidth, animated: false });
  }, [monthIndex, pageWidth]);

  const turnTo = (index: number) => {
    following.current = true;
    monthsRef.current?.scrollTo({ x: index * pageWidth, animated: !reduceMotion });
  };

  return (
    <View>
      <EdgePrint className="mb-2">{edge}</EdgePrint>
      <View className="mb-3 mt-0.5 flex-row items-center justify-between">
        <Display variant="slip">{months[monthIndex]?.title}</Display>
        <View className="flex-row gap-3">
          <StepButton icon={CaretLeft} step={previous} onPress={() => turnTo(monthIndex - 1)} />
          <StepButton icon={CaretRight} step={next} onPress={() => turnTo(monthIndex + 1)} />
        </View>
      </View>

      <View className="flex-row">
        {weekdays.map((weekday, i) => (
          <View key={`weekday-${i}`} className="h-5.5 w-1/7 items-center justify-center">
            <EdgePrint size="frame-label">{weekday}</EdgePrint>
          </View>
        ))}
      </View>
      <ScrollView
        ref={monthsRef}
        testID="when-slip-months"
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        // Opens on the chosen month rather than scrolling there from the first.
        contentOffset={{ x: monthIndex * pageWidth, y: 0 }}
        onScrollBeginDrag={() => {
          following.current = true;
        }}
        className="-mx-5 mt-1.5"
        onLayout={(event) => {
          const width = event.nativeEvent.layout.width;
          setPageWidth(width);
          following.current = false;
          monthsRef.current?.scrollTo({ x: page.current * width, animated: false });
        }}
        onScroll={(event) => {
          if (!following.current || !pageWidth) return;
          const index = Math.round(event.nativeEvent.contentOffset.x / pageWidth);
          if (index === page.current || index < 0 || index >= months.length) return;
          page.current = index;
          onMonthChange(index);
        }}
      >
        {months.map((month) => (
          <MonthGrid key={month.key} days={month.days} width={pageWidth} />
        ))}
      </ScrollView>

      <ScrollView
        ref={timesRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        className="-mx-5 mt-3.5"
        contentContainerStyle={{ paddingHorizontal: TIME_MARGIN, gap: TIME_GAP }}
        onLayout={(event) =>
          setTimeWidth(
            (event.nativeEvent.layout.width - 2 * TIME_MARGIN - (TIMES_IN_VIEW - 1) * TIME_GAP) / TIMES_IN_VIEW,
          )
        }
        // Once the times have their width, bring the chosen one in, second from the left.
        onContentSizeChange={() =>
          timesRef.current?.scrollTo({ x: Math.max(0, selectedTime - 1) * (timeWidth + TIME_GAP), animated: false })
        }
      >
        {times.map((time) => (
          <Pressable
            key={time.key}
            accessibilityRole="button"
            accessibilityLabel={time.label}
            accessibilityState={{ selected: time.selected, disabled: time.disabled }}
            disabled={time.disabled}
            onPress={time.onPress}
            style={{ width: timeWidth }}
            className={[
              "h-13.5 items-center justify-center rounded-paper",
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
