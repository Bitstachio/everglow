import { Display } from "@/components/ui/display";
import { EdgePrint } from "@/components/ui/edge-print";
import { Monochrome } from "@/components/ui/monochrome";
import { RetryingPhoto } from "@/components/ui/retrying-photo";
import { LinearGradient } from "expo-linear-gradient";
import { styled } from "nativewind";
import { useTranslation } from "react-i18next";
import { Pressable, Text, View } from "react-native";
import { describeTime } from "../lib/describe-time";
import { rollTime } from "../lib/rolls";
import type { EventResponseDto } from "../types";
import { getEventCoverCacheKey } from "./event-cover";

type HomeEventCardProps = {
  event: EventResponseDto;
  onPress?: () => void;
  /** Injectable clock so the timing line is deterministic in tests. */
  now?: Date;
  /** Offline, when the list was last loaded ("21:40"). It replaces the timing line. */
  savedAt?: string | null;
};

type GalleryState = EventResponseDto["galleryState"];

// The ground colour, fading in over the photo so the text stays readable.
const SCRIM = ["#0E0E0E59", "#0E0E0EE6"] as const;

const Gradient = styled(LinearGradient, { className: "style" });

const STATUS_KEYS: Record<GalleryState, "upcoming" | "open" | "closed"> = {
  UPCOMING: "upcoming",
  OPEN: "open",
  CLOSED: "closed",
};

// Open is the one tag filled in: it's the state people act on.
const STATUS_CLASSES: Record<GalleryState, { box: string; text: string }> = {
  UPCOMING: { box: "border border-outline-soft", text: "text-text" },
  OPEN: { box: "bg-leader", text: "text-on-leader" },
  CLOSED: { box: "border border-outline-soft", text: "text-text-2" },
};

const StatusTag = ({ state }: { state: GalleryState }) => {
  const { t } = useTranslation("home");
  const classes = STATUS_CLASSES[state];
  return (
    <View className={`self-start rounded-frame px-2 py-1 ${classes.box}`}>
      <Text className={`font-mono-semibold text-edge-print uppercase ${classes.text}`}>
        {t(`event.status.${STATUS_KEYS[state]}`)}
      </Text>
    </View>
  );
};

/**
 * The cover behind the card. Closed events are in black and white and fainter,
 * like a set of photos that has been taken down.
 */
const CardBackground = ({ coverUrl, event }: { coverUrl: string; event: EventResponseDto }) => {
  const photo = (
    <RetryingPhoto
      uri={coverUrl}
      cacheKey={getEventCoverCacheKey(event.id, coverUrl)}
      className="h-full w-full"
      contentFit="cover"
      cachePolicy="memory-disk"
      transition={150}
    />
  );

  return (
    <>
      <View
        pointerEvents="none"
        className={`absolute inset-0 ${event.galleryState === "CLOSED" ? "opacity-40" : "opacity-70"}`}
      >
        {event.galleryState === "CLOSED" ? <Monochrome className="h-full w-full">{photo}</Monochrome> : photo}
      </View>
      <Gradient pointerEvents="none" colors={SCRIM} className="absolute inset-0" />
    </>
  );
};

/**
 * One event on the events list: the status, the name, a line of timing, the
 * counts, and the description in one line. The photo is the card's background.
 */
export const HomeEventCard = ({ event, onPress, now = new Date(), savedAt = null }: HomeEventCardProps) => {
  const { t } = useTranslation("home");
  const closed = event.galleryState === "CLOSED";

  const timeText = describeTime(t, rollTime(event, now));
  // Offline the timing would be stale, so the card says when it was loaded instead.
  const timingLine = savedAt ? t("offline.asOf", { time: savedAt }) : timeText;
  const counts = [
    event.galleryState === "OPEN" ? t("event.photos", { count: event.photoCount }) : null,
    t("event.members", { count: event.usage.members }),
  ]
    .filter(Boolean)
    .join(" · ");
  const description = event.description?.trim() ?? "";

  return (
    <Pressable
      testID="event-card"
      accessibilityRole="button"
      accessibilityLabel={t("event.label", { title: event.title, status: timeText })}
      onPress={onPress}
      className="mx-5 overflow-hidden rounded-paper border border-line bg-sheet active:opacity-80"
    >
      {event.coverUrl ? <CardBackground coverUrl={event.coverUrl} event={event} /> : null}
      <View className="gap-2 p-4">
        <View className="flex-row">
          <StatusTag state={event.galleryState} />
        </View>
        <Display variant="roll" numberOfLines={1} className={closed ? "text-text-2" : ""}>
          {event.title}
        </Display>
        <View className="gap-1">
          <EdgePrint>{timingLine}</EdgePrint>
          <EdgePrint>{counts}</EdgePrint>
          {/* Reserves the line when there is no description, so cards keep their height. */}
          <Text numberOfLines={1} className="min-h-5 font-sans text-body text-text-2">
            {description}
          </Text>
        </View>
      </View>
    </Pressable>
  );
};
