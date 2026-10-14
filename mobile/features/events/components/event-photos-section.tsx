import { AppIcon } from "@/components/ui/app-icon";
import { H2 } from "@/components/ui/heading";
import { IconButton } from "@/components/ui/icon-button";
import { Spinner } from "@/components/ui/spinner";
import { ThemedText } from "@/components/ui/themed-text";
import { CirclePlus, Download, Images, RotateCw, Trash2 } from "lucide-react-native";
import { Image, Pressable, View } from "react-native";
import type { Photo, PhotoUploadStatus } from "../types";

type EventPhotosSectionProps = {
  photos: Photo[];
  currentUserId?: string;
  isAdmin: boolean;
  /** Null while nothing is uploading. */
  uploadStatus: PhotoUploadStatus | null;
  /** Photos that did not upload, shown first as tiles the member can retry. */
  failedUploads: { uri: string }[];
  /** The gallery's storage, e.g. "1.2 GB of 3 GB used". */
  storageLabel: string | null;
  onUpload: () => void;
  onDownload: (photo: Photo) => void;
  onDelete: (photo: Photo) => void;
  onFailedUploadPress: (uri: string) => void;
};

type GalleryTile = { kind: "failed"; key: string; uri: string } | { kind: "photo"; key: string; photo: Photo };

export const EventPhotosSection = ({
  photos,
  currentUserId,
  isAdmin,
  uploadStatus,
  failedUploads,
  storageLabel,
  onUpload,
  onDownload,
  onDelete,
  onFailedUploadPress,
}: EventPhotosSectionProps) => {
  const isUploading = uploadStatus !== null;
  const progressLabel = !uploadStatus
    ? ""
    : uploadStatus.phase === "preparing"
      ? "Preparing photos…"
      : `Uploading ${uploadStatus.done} of ${uploadStatus.total}`;
  const tiles: GalleryTile[] = [
    ...failedUploads.map(({ uri }): GalleryTile => ({ kind: "failed", key: `failed:${uri}`, uri })),
    ...photos.map((photo): GalleryTile => ({ kind: "photo", key: photo.id, photo })),
  ];

  return (
    <View className="gap-4">
      <View className="flex-row items-center justify-between gap-3">
        <View className="flex-1 gap-1">
          <H2>Event Photos</H2>
          {storageLabel ? (
            <ThemedText className="text-sm" tone="muted">
              {storageLabel}
            </ThemedText>
          ) : null}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={isUploading ? progressLabel : "Add photos"}
          accessibilityState={{ disabled: isUploading, busy: isUploading }}
          disabled={isUploading}
          onPress={onUpload}
          className="h-11 flex-row items-center gap-2 rounded-xl bg-surface px-3"
          hitSlop={8}
        >
          {isUploading ? (
            <>
              <Spinner label={progressLabel} />
              <ThemedText className="text-sm font-medium" tone="accent">
                {progressLabel}
              </ThemedText>
            </>
          ) : (
            <>
              <AppIcon icon={CirclePlus} size="md" className="text-accent" />
              <ThemedText className="text-sm font-medium" tone="accent">
                Add Photos
              </ThemedText>
            </>
          )}
        </Pressable>
      </View>

      {tiles.length === 0 ? (
        <View className="items-center gap-3 rounded-2xl border border-border bg-background p-8">
          <AppIcon icon={Images} size="xl" className="text-muted" />
          <ThemedText className="text-base font-semibold">No photos yet</ThemedText>
          <ThemedText className="text-center text-sm" tone="muted">
            Add photos to share memories from this event
          </ThemedText>
        </View>
      ) : (
        <View className="gap-3">
          {Array.from({ length: Math.ceil(tiles.length / 2) }, (_, rowIndex) => {
            const row = tiles.slice(rowIndex * 2, rowIndex * 2 + 2);
            return (
              <View key={row[0]?.key ?? rowIndex} className="flex-row gap-3">
                {row.map((tile) => {
                  if (tile.kind === "failed") {
                    return (
                      <Pressable
                        key={tile.key}
                        accessibilityRole="button"
                        accessibilityLabel="Photo not uploaded. Retry or remove"
                        accessibilityState={{ disabled: isUploading }}
                        disabled={isUploading}
                        onPress={() => onFailedUploadPress(tile.uri)}
                        className="flex-1 overflow-hidden rounded-xl"
                        style={{ aspectRatio: 3 / 2 }}
                      >
                        <Image source={{ uri: tile.uri }} className="h-full w-full bg-surface opacity-40" />
                        <View className="absolute inset-0 items-center justify-center gap-1">
                          <View className="h-11 w-11 items-center justify-center rounded-full bg-danger">
                            <AppIcon icon={RotateCw} size="sm" className="text-accent-foreground" />
                          </View>
                          <ThemedText className="text-xs font-semibold">Not uploaded</ThemedText>
                        </View>
                      </Pressable>
                    );
                  }
                  const { photo } = tile;
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
                          <AppIcon icon={Download} size="sm" className="text-accent-foreground" />
                        </IconButton>
                      </View>
                      {canDelete ? (
                        <View className="absolute right-2 top-2">
                          <IconButton
                            accessibilityLabel={`Delete photo ${photo.id}`}
                            onPress={() => onDelete(photo)}
                            className="bg-danger"
                          >
                            <AppIcon icon={Trash2} size="sm" className="text-accent-foreground" />
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
