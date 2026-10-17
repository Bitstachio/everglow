import { Display } from "@/components/ui/display";
import { EdgePrint, EdgeValue } from "@/components/ui/edge-print";
import { FilmStrip, type StripFrame } from "@/components/ui/film-strip";
import { GreasePencil } from "@/components/ui/grease-pencil";
import { PencilNote } from "@/components/ui/pencil-note";
import type { TFunction } from "i18next";
import { useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { Pressable, View, type LayoutChangeEvent } from "react-native";
import {
  formatClosedOn,
  formatClosesOn,
  formatOpensOn,
  isLastDay,
  ROLL_FRAMES,
  rollTime,
  type RollPhoto,
  type RollTime,
} from "../lib/rolls";
import type { EventResponseDto } from "../types";
import { getEventCoverCacheKey } from "./event-cover";

type RollCardProps = {
  event: EventResponseDto;
  onPress?: () => void;
  /** An open roll's latest photos, newest first. Blank frames fill the rest. */
  photos?: RollPhoto[];
  /** Injectable clock so the last-day countdown is deterministic in tests. */
  now?: Date;
  /** Offline, when the list was last loaded ("21:40"). It replaces the roll's time (03.5). */
  savedAt?: string | null;
};

type Size = { width: number; height: number };

const sizeOf = (event: LayoutChangeEvent): Size => ({
  width: Math.round(event.nativeEvent.layout.width),
  height: Math.round(event.nativeEvent.layout.height),
});

// An open roll shows its first photos, or its cover until it has any. Upcoming
// rolls are unexposed and closed ones have lost their photos, so their frames
// are blank. A blank frame carries its number.
const buildFrames = (event: EventResponseDto, photos: RollPhoto[]): StripFrame[] => {
  const closed = event.galleryState === "CLOSED";
  const cover = event.coverUrl
    ? [{ uri: event.coverUrl, cacheKey: getEventCoverCacheKey(event.id, event.coverUrl) }]
    : [];
  const exposed = event.galleryState !== "OPEN" ? [] : photos.length > 0 ? photos : cover;
  return Array.from({ length: ROLL_FRAMES }, (_, i) => {
    const photo = exposed[i];
    if (photo) return { key: `${event.id}-photo-${i}`, ...photo };
    return { key: `${event.id}-${i + 1}`, number: i + 1, dim: closed };
  });
};

/** One roll on Home (03.3–03.4): the name, a film strip, and a line of edge print. */
export const RollCard = ({ event, onPress, photos = [], now = new Date(), savedAt = null }: RollCardProps) => {
  const { t } = useTranslation("home");
  const [noteSize, setNoteSize] = useState<Size>({ width: 0, height: 0 });
  const [stripSize, setStripSize] = useState<Size>({ width: 0, height: 0 });

  const descriptor = rollTime(event, now);
  // Offline the countdown would be stale, so it isn't shown (03.5).
  const lastDay = savedAt === null && isLastDay(event, now);
  const upcoming = event.galleryState === "UPCOMING";
  const closed = event.galleryState === "CLOSED";
  const seed = event.title.length + 1;

  const timeText = describeTime(t, descriptor);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("roll.label", { title: event.title, status: timeText })}
      onPress={onPress}
      className="active:opacity-80"
    >
      <View className="z-10 flex-row items-baseline justify-between px-5 pb-2.5">
        <Display
          variant="roll"
          className={`flex-1 ${upcoming || closed ? "text-text-2" : ""}`.trim()}
          numberOfLines={1}
        >
          {event.title}
        </Display>
        {lastDay ? (
          <View className="relative ml-6 mr-1.5">
            <View onLayout={(event) => setNoteSize(sizeOf(event))}>
              <PencilNote>{timeText}</PencilNote>
            </View>
            {noteSize.width > 0 ? (
              <View className="absolute -left-6 -top-4">
                <GreasePencil
                  mark="ring"
                  width={noteSize.width + 48}
                  height={noteSize.height + 32}
                  seed={seed}
                  drawOn
                />
              </View>
            ) : null}
          </View>
        ) : null}
      </View>

      <View onLayout={(event) => setStripSize(sizeOf(event))}>
        <FilmStrip frames={buildFrames(event, photos)} />
        {/* Crossed out across the frames, clear of the sprocket holes. */}
        {closed && stripSize.width > 0 ? (
          <View className="absolute left-10 top-5.25">
            <GreasePencil mark="cross" width={stripSize.width - 80} height={stripSize.height - 42} seed={seed} />
          </View>
        ) : null}
      </View>

      <View className="flex-row items-center justify-between px-5 pt-2.25">
        <EdgePrint>
          <Trans
            t={t}
            i18nKey={upcoming ? "roll.peopleIn" : "roll.people"}
            values={{ count: event.usage.members }}
            components={{ value: <EdgeValue>{null}</EdgeValue> }}
          />
          {savedAt ? ` · ${t("offline.asOf", { time: savedAt })}` : null}
        </EdgePrint>
        {lastDay || savedAt ? null : <EdgePrint>{timeText}</EdgePrint>}
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
