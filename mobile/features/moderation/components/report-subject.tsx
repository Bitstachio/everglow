import { getEventCoverCacheKey } from "@/features/events/components/event-cover";
import { Avatar } from "@/components/ui/avatar";
import { EdgePrint } from "@/components/ui/edge-print";
import { GreasePencil } from "@/components/ui/grease-pencil";
import { Monochrome } from "@/components/ui/monochrome";
import { RetryingPhoto } from "@/components/ui/retrying-photo";
import { View } from "react-native";

type ReportSubjectProps = {
  /** The edge print under the print: "▸ 144 · Marcus". */
  label: string;
  /** Circle it in pencil, as a reported frame is (10.1). */
  circled?: boolean;
} & (
  | { kind: "frame"; photoId: string | undefined; uri: string | null | undefined }
  | { kind: "cover"; eventId: string; uri: string | null | undefined }
  | { kind: "person"; userId: string; name: string | null | undefined; avatarUrl: string | null | undefined }
);

/** The print in 10.1, 10.5 and 10.6: 126 wide with a 6 px rebate and its edge print in a 22 px strip. */
const PRINT = { width: 126, rebate: 6, strip: 22 } as const;
/** A frame is nearly square; a portrait or a cover is cut wider (10.5, 10.6). */
const PRINT_HEIGHT = { frame: 140, cover: 120, person: 120 } as const;
/** How far the pencil ring reaches past the print on each side (10.1). */
const RING = { left: 15, right: 13, top: 15, bottom: 12 } as const;

/**
 * What's being reported, as a small print at the top of the ticket: the
 * frame, the person's portrait in black and white, or the roll's cover.
 */
export const ReportSubject = (props: ReportSubjectProps) => {
  const height = PRINT_HEIGHT[props.kind];
  return (
    <View accessible accessibilityLabel={props.label} className="items-center">
      <View
        className="rounded-frame bg-rebate"
        style={{
          width: PRINT.width,
          height,
          padding: PRINT.rebate,
          paddingBottom: PRINT.strip,
        }}
      >
        <View className="flex-1 overflow-hidden bg-frame-empty">
          {props.kind === "frame" ? (
            <RetryingPhoto
              uri={props.uri ?? undefined}
              cacheKey={props.photoId ? `photo:${props.photoId}:thumbnail` : undefined}
              className="h-full w-full"
              contentFit="cover"
            />
          ) : props.kind === "cover" ? (
            <RetryingPhoto
              uri={props.uri ?? undefined}
              cacheKey={props.uri ? getEventCoverCacheKey(props.eventId, props.uri) : undefined}
              className="h-full w-full"
              contentFit="cover"
            />
          ) : (
            <Monochrome className="h-full w-full">
              <Avatar userId={props.userId} name={props.name} uri={props.avatarUrl} size="fill" />
            </Monochrome>
          )}
        </View>
        <EdgePrint
          size="frame-label"
          numberOfLines={1}
          className="absolute"
          style={{ left: PRINT.rebate, right: PRINT.rebate, bottom: 5 }}
        >
          {props.label}
        </EdgePrint>
      </View>
      {props.circled ? (
        <View pointerEvents="none" className="absolute" style={{ top: -RING.top, marginLeft: RING.right - RING.left }}>
          <GreasePencil
            mark="ring"
            width={PRINT.width + RING.left + RING.right}
            height={height + RING.top + RING.bottom}
            strokeWidth={3}
            seed={3}
            drawOn
          />
        </View>
      ) : null}
    </View>
  );
};
