import { H2 } from "@/components/ui/heading";
import { IconButton } from "@/components/ui/icon-button";
import { Spinner } from "@/components/ui/spinner";
import { ThemedText } from "@/components/ui/themed-text";
import { IconSize } from "@/constants/icons";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { colorTokens } from "@/theme/tokens";
import { Ionicons } from "@expo/vector-icons";
import { Image, Pressable, View } from "react-native";
import type { Photo } from "../types";

type EventPhotosSectionProps = {
  photos: Photo[];
  currentUserId?: string;
  isAdmin: boolean;
  isUploading: boolean;
  onUpload: () => void;
  onDownload: (photo: Photo) => void;
  onDelete: (photo: Photo) => void;
};

export const EventPhotosSection = ({
  photos,
  currentUserId,
  isAdmin,
  isUploading,
  onUpload,
  onDownload,
  onDelete,
}: EventPhotosSectionProps) => {
  const colorScheme = useColorScheme();
  const accent = colorTokens[colorScheme].accent;
  const muted = colorTokens[colorScheme].muted;
  const onAccent = colorTokens[colorScheme].accentForeground;

  return (
    <View className="gap-4">
      <View className="flex-row items-center justify-between gap-3">
        <H2 className="flex-1">Event Photos</H2>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add photo"
          accessibilityState={{ disabled: isUploading, busy: isUploading }}
          disabled={isUploading}
          onPress={onUpload}
          className="h-11 flex-row items-center gap-2 rounded-xl bg-surface px-3"
          hitSlop={8}
        >
          {isUploading ? (
            <Spinner label="Uploading photo" />
          ) : (
            <>
              <Ionicons name="add-circle" size={IconSize.md} color={accent} />
              <ThemedText className="text-sm font-medium" tone="accent">
                Add Photo
              </ThemedText>
            </>
          )}
        </Pressable>
      </View>

      {photos.length === 0 ? (
        <View className="items-center gap-3 rounded-2xl border border-border bg-background p-8">
          <Ionicons name="images-outline" size={IconSize.xl} color={muted} />
          <ThemedText className="text-base font-semibold">No photos yet</ThemedText>
          <ThemedText className="text-center text-sm" tone="muted">
            Add photos to share memories from this event
          </ThemedText>
        </View>
      ) : (
        <View className="gap-3">
          {Array.from({ length: Math.ceil(photos.length / 2) }, (_, rowIndex) => {
            const row = photos.slice(rowIndex * 2, rowIndex * 2 + 2);
            return (
              <View key={row[0]?.id ?? rowIndex} className="flex-row gap-3">
                {row.map((photo) => {
                  const canDelete = isAdmin || photo.addedById === currentUserId;
                  return (
                    <View key={photo.id} className="flex-1 overflow-hidden rounded-xl" style={{ aspectRatio: 3 / 2 }}>
                      <Image
                        accessibilityLabel={`Event photo ${photo.id}`}
                        source={{ uri: photo.url }}
                        className="h-full w-full bg-surface"
                      />
                      <View className="absolute bottom-2 right-2">
                        <IconButton
                          accessibilityLabel={`Download photo ${photo.id}`}
                          onPress={() => onDownload(photo)}
                          className="bg-accent"
                        >
                          <Ionicons name="download-outline" size={IconSize.sm} color={onAccent} />
                        </IconButton>
                      </View>
                      {canDelete ? (
                        <View className="absolute right-2 top-2">
                          <IconButton
                            accessibilityLabel={`Delete photo ${photo.id}`}
                            onPress={() => onDelete(photo)}
                            className="bg-danger"
                          >
                            <Ionicons name="trash-outline" size={IconSize.sm} color={onAccent} />
                          </IconButton>
                        </View>
                      ) : null}
                    </View>
                  );
                })}
                {row.length === 1 ? <View className="flex-1" /> : null}
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
};
