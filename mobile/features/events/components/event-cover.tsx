import { Image } from "expo-image";
import { useState } from "react";
import { View } from "react-native";

type EventCoverProps = {
  eventId: string;
  /** Short-lived presigned URL; null when the event has no cover. */
  uri: string | null | undefined;
  className?: string;
};

const FILL = { width: "100%", height: "100%" } as const;

/**
 * Cover URLs are re-signed on every fetch and expire after 15 minutes, so the
 * full URL is useless as a cache key. The path names the uploaded object
 * (`event-covers/{eventId}/{uploadId}`) and only changes when the cover does.
 */
export const getEventCoverCacheKey = (eventId: string, uri: string): string => {
  const path = uri.split("?")[0];
  return `event-cover:${eventId}:${path}`;
};

/** The event's cover at the 16:9 it was cropped to; renders nothing without one. */
export const EventCover = ({ eventId, uri, className = "" }: EventCoverProps) => {
  const [failedUri, setFailedUri] = useState<string | null>(null);
  if (!uri || uri === failedUri) return null;

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className={`aspect-video w-full overflow-hidden bg-surface ${className}`}
    >
      <Image
        testID="event-cover-image"
        source={{ uri, cacheKey: getEventCoverCacheKey(eventId, uri) }}
        style={FILL}
        contentFit="cover"
        cachePolicy="memory-disk"
        transition={150}
        onError={() => setFailedUri(uri)}
      />
    </View>
  );
};
