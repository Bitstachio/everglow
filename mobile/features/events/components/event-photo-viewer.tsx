import { AppIcon } from "@/components/ui/app-icon";
import { Avatar } from "@/components/ui/avatar";
import { IconButton } from "@/components/ui/icon-button";
import { ThemedText } from "@/components/ui/themed-text";
import { Download, Trash2, X } from "lucide-react-native";
import { Image, Modal, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { EventParticipantResponseDto, Photo } from "../types";

type EventPhotoViewerProps = {
  photo: Photo | null;
  participants: EventParticipantResponseDto[];
  currentUserId?: string;
  isAdmin: boolean;
  onClose: () => void;
  onDownload: (photo: Photo) => void;
  onDelete: (photo: Photo) => void;
};

export const EventPhotoViewer = ({
  photo,
  participants,
  currentUserId,
  isAdmin,
  onClose,
  onDownload,
  onDelete,
}: EventPhotoViewerProps) => {
  const insets = useSafeAreaInsets();

  if (!photo) return null;

  const uploader = photo.addedById
    ? participants.find((participant) => participant.userId === photo.addedById)
    : undefined;
  const canDelete = isAdmin || photo.addedById === currentUserId;
  const usernameLabel = uploader?.username ? `@${uploader.username}` : "Unknown";

  return (
    <Modal testID="event-photo-viewer" animationType="fade" visible transparent={false} onRequestClose={onClose}>
      <View className="flex-1 bg-black">
        <View
          className="absolute left-0 right-0 top-0 z-10 flex-row items-center justify-between gap-3 px-4"
          style={{ paddingTop: Math.max(insets.top, 16) }}
        >
          <View
            accessibilityRole="summary"
            accessibilityLabel={`Uploaded by ${usernameLabel}`}
            className="min-w-0 flex-1 flex-row items-center gap-3"
          >
            <Avatar
              userId={uploader?.userId ?? photo.addedById ?? "unknown"}
              name={uploader?.name ?? "Unknown"}
              uri={uploader?.avatarUrl}
            />
            <ThemedText className="flex-1 text-base font-semibold text-white" numberOfLines={1}>
              {usernameLabel}
            </ThemedText>
          </View>
          <IconButton accessibilityLabel="Close photo" onPress={onClose} className="bg-scrim">
            <AppIcon icon={X} size="md" className="text-white" />
          </IconButton>
        </View>

        <View className="flex-1 items-center justify-center px-2">
          <Image
            accessibilityLabel={`Event photo ${photo.id}`}
            source={{ uri: photo.url }}
            className="h-full w-full"
            resizeMode="contain"
          />
        </View>

        <View
          className="absolute bottom-0 right-0 z-10 flex-row items-center gap-3 px-4"
          style={{ paddingBottom: Math.max(insets.bottom, 24) }}
        >
          <IconButton
            accessibilityLabel={`Download photo ${photo.id}`}
            onPress={() => onDownload(photo)}
            className="bg-accent"
          >
            <AppIcon icon={Download} size="sm" className="text-accent-foreground" />
          </IconButton>
          {canDelete ? (
            <IconButton
              accessibilityLabel={`Delete photo ${photo.id}`}
              onPress={() => onDelete(photo)}
              className="bg-danger"
            >
              <AppIcon icon={Trash2} size="sm" className="text-accent-foreground" />
            </IconButton>
          ) : null}
        </View>
      </View>
    </Modal>
  );
};
