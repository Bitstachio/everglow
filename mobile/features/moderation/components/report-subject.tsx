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

const PRINT = 118;

/**
 * What's being reported, as a small print at the top of the ticket: the
 * frame, the person's portrait in black and white, or the roll's cover.
 */
export const ReportSubject = (props: ReportSubjectProps) => (
  <View accessible accessibilityLabel={props.label} className="items-center">
    <View className="bg-rebate px-1.5 pb-1 pt-1.5">
      <View style={{ width: PRINT, height: PRINT }} className="overflow-hidden bg-frame-empty">
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
      <EdgePrint size="frame-label" numberOfLines={1} className="pt-1 text-center">
        {props.label}
      </EdgePrint>
    </View>
    {props.circled ? (
      <View pointerEvents="none" className="absolute -top-3" style={{ width: PRINT + 46, height: PRINT + 46 }}>
        <GreasePencil mark="ring" width={PRINT + 46} height={PRINT + 46} strokeWidth={2.5} seed={3} drawOn />
      </View>
    ) : null}
  </View>
);
