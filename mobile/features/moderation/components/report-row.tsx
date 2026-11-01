import { Avatar } from "@/components/ui/avatar";
import { EdgePrint } from "@/components/ui/edge-print";
import { Monochrome } from "@/components/ui/monochrome";
import { RetryingPhoto } from "@/components/ui/retrying-photo";
import { Pressable, Text, View } from "react-native";
import type { EventParticipantResponseDto } from "../types";

type ReportRowProps = {
  title: string;
  /** "3 reports · nudity · hidden". */
  edge: string;
  /** The frame's thumbnail, or null for a person. */
  photo: { id: string; thumbnailUrl: string | null } | null;
  person: EventParticipantResponseDto | null;
  /** A hidden frame stays blurred in the list, so nobody sees it by scrolling past. */
  blurred: boolean;
  onPress: () => void;
};

const THUMB = 64;

/** One ticket on 10.8: the frame or the person, the reasons and how many, "›". */
export const ReportRow = ({ title, edge, photo, person, blurred, onPress }: ReportRowProps) => (
  <Pressable
    accessibilityRole="button"
    accessibilityLabel={`${title}, ${edge}`}
    onPress={onPress}
    className="min-h-23 flex-row items-center gap-3.5 border-b border-line py-3.5 active:bg-sheet"
  >
    <View style={{ width: THUMB, height: THUMB }} className="overflow-hidden rounded-xs bg-frame-empty">
      {photo ? (
        <RetryingPhoto
          uri={photo.thumbnailUrl ?? undefined}
          cacheKey={`photo:${photo.id}:thumbnail`}
          className="h-full w-full"
          contentFit="cover"
          blurRadius={blurred ? 24 : 0}
        />
      ) : person ? (
        <Monochrome className="h-full w-full">
          <Avatar userId={person.userId} name={person.name} uri={person.avatarUrl} size="fill" />
        </Monochrome>
      ) : null}
    </View>
    <View className="flex-1 gap-1">
      <Text className="font-sans-semibold text-name text-text" numberOfLines={1}>
        {title}
      </Text>
      <EdgePrint numberOfLines={1}>{edge}</EdgePrint>
    </View>
    <EdgePrint>›</EdgePrint>
  </Pressable>
);
