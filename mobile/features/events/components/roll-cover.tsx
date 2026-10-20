import { Display } from "@/components/ui/display";
import { EdgePrint } from "@/components/ui/edge-print";
import { Photo } from "@/components/ui/photo";
import { View } from "react-native";
import { getEventCoverCacheKey } from "./event-cover";

type RollCoverProps = {
  eventId: string;
  /** Null before a host sets one, and while the roll is suspended. */
  uri: string | null;
  title: string;
  /** Edge print under the name: date, host, how long the roll is. */
  sub: string;
  /** Upcoming: the cover is dimmed, the frames still unexposed (07.1). The name stays bright. */
  dim?: boolean;
};

const COVER_HEIGHT = 300;

// Darkens the top for the buttons, then fades into the ground under the name.
const Fade = () => (
  <View
    pointerEvents="none"
    className="absolute left-0 right-0 top-0"
    style={{
      height: COVER_HEIGHT,
      experimental_backgroundImage:
        "linear-gradient(to bottom, rgba(14,14,14,0.35) 0%, rgba(14,14,14,0) 30%, rgba(14,14,14,0) 60%, rgba(14,14,14,1) 100%)",
    }}
  />
);

/** The top of the roll: its cover, its name over the cover's foot, and the edge print under it. */
export const RollCover = ({ eventId, uri, title, sub, dim = false }: RollCoverProps) => (
  <View>
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className="absolute left-0 right-0 top-0 bg-viewer"
      style={{ height: COVER_HEIGHT }}
    >
      {uri ? (
        <Photo
          testID="roll-cover-image"
          source={{ uri, cacheKey: getEventCoverCacheKey(eventId, uri) }}
          contentFit="cover"
          contentPosition={{ top: "40%" }}
          cachePolicy="memory-disk"
          className={`h-full w-full ${dim ? "opacity-45" : ""}`.trim()}
        />
      ) : null}
      <Fade />
    </View>
    <View className="px-5" style={{ paddingTop: COVER_HEIGHT - 52 }}>
      <Display variant="event">{title}</Display>
      <EdgePrint className="mt-2.5" numberOfLines={1}>
        {sub}
      </EdgePrint>
    </View>
  </View>
);
