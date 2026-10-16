import { Display } from "@/components/ui/display";
import { EdgePrint } from "@/components/ui/edge-print";
import { FilmStrip, type StripFrame } from "@/components/ui/film-strip";
import { GreasePencil } from "@/components/ui/grease-pencil";
import { PencilNote } from "@/components/ui/pencil-note";
import type { TFunction } from "i18next";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, View, type LayoutChangeEvent } from "react-native";
import { formatClosedOn, formatClosesOn, formatOpensOn, isLastDay, rollTime, type RollTime } from "../lib/rolls";
import type { EventResponseDto } from "../types";

type RollCardProps = {
  event: EventResponseDto;
  onPress?: () => void;
  /** Injectable clock so the last-day countdown is deterministic in tests. */
  now?: Date;
};

type Size = { width: number; height: number };

const sizeOf = (event: LayoutChangeEvent): Size => ({
  width: Math.round(event.nativeEvent.layout.width),
  height: Math.round(event.nativeEvent.layout.height),
});

// Only the cover is known per roll; the rest of the strip is unexposed until
// per-frame previews land (EV-137/139). A blank frame carries its number.
const buildFrames = (event: EventResponseDto): StripFrame[] => {
  const closed = event.galleryState === "CLOSED";
  const hasCover = event.galleryState === "OPEN" && Boolean(event.coverUrl);
  return [1, 2, 3, 4].map((n) => {
    if (hasCover && n === 1) return { key: `${event.id}-cover`, uri: event.coverUrl ?? undefined };
    return { key: `${event.id}-${n}`, number: n, dim: closed };
  });
};

/** One roll on Home (03.3–03.4): the name, a film strip, and a line of edge print. */
export const RollCard = ({ event, onPress, now = new Date() }: RollCardProps) => {
  const { t } = useTranslation("home");
  const [noteSize, setNoteSize] = useState<Size>({ width: 0, height: 0 });
  const [stripSize, setStripSize] = useState<Size>({ width: 0, height: 0 });

  const descriptor = rollTime(event, now);
  const lastDay = isLastDay(event, now);
  const upcoming = event.galleryState === "UPCOMING";
  const closed = event.galleryState === "CLOSED";
  const seed = event.title.length + 1;

  const timeText = describeTime(t, descriptor);
  const peopleText = upcoming
    ? t("roll.peopleIn", { count: event.usage.members })
    : t("roll.people", { count: event.usage.members });

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("roll.label", { title: event.title, status: timeText })}
      onPress={onPress}
      className="active:opacity-80"
    >
      <View className="flex-row items-baseline justify-between px-5 pb-2.5">
        <Display variant="roll" className={`flex-1 ${upcoming ? "text-text-2" : ""}`.trim()} numberOfLines={1}>
          {event.title}
        </Display>
        {lastDay ? (
          <View className="relative ml-3">
            <View onLayout={(event) => setNoteSize(sizeOf(event))}>
              <PencilNote>{timeText}</PencilNote>
            </View>
            {noteSize.width > 0 ? (
              <View className="absolute -left-2 -top-1">
                <GreasePencil mark="ring" width={noteSize.width + 16} height={noteSize.height + 8} seed={seed} drawOn />
              </View>
            ) : null}
          </View>
        ) : null}
      </View>

      <View onLayout={(event) => setStripSize(sizeOf(event))}>
        <FilmStrip frames={buildFrames(event)} />
        {closed && stripSize.width > 0 ? (
          <View className="absolute left-0 top-0">
            <GreasePencil mark="cross" width={stripSize.width} height={stripSize.height} seed={seed} />
          </View>
        ) : null}
      </View>

      <View className="flex-row items-center justify-between px-5 pt-2.25">
        <EdgePrint>{peopleText}</EdgePrint>
        {lastDay ? null : <EdgePrint>{timeText}</EdgePrint>}
      </View>
    </Pressable>
  );
};

const describeTime = (t: TFunction<"home">, descriptor: RollTime): string => {
  switch (descriptor.kind) {
    case "closingSoon":
      return t("time.left", { hours: descriptor.hours, minutes: descriptor.minutes });
    case "closesOn":
      return t("time.until", { date: formatClosesOn(descriptor.iso) });
    case "open":
      return t("time.open");
    case "opensOn":
      return t("time.opensAt", { when: formatOpensOn(descriptor.iso) });
    case "closedOn":
      return t("time.closedOn", { date: formatClosedOn(descriptor.iso) });
  }
};
