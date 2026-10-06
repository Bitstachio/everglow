import { useAuth } from "@/context/auth-context";
import { getErrorMessage } from "@/lib/api/errors";
import * as ImagePicker from "expo-image-picker";
import { File, Paths } from "expo-file-system";
import * as MediaLibrary from "expo-media-library";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Alert } from "react-native";
import {
  useDeleteEventPhotoMutation,
  useLeaveEventMutation,
  useRemoveEventParticipantMutation,
  useUploadEventPhotosMutation,
} from "../api/mutations";
import { getFailedPhotoUploads, setFailedPhotoUploads, useFailedPhotoUploads } from "../api/failed-photo-uploads";
import type { EventPhotoFile } from "../api/upload-event-photos";
import { useEventParticipantsQuery, useEventPhotosQuery, useEventQuery } from "../api/queries";
import type { PhotoResponseDto, PhotoUploadStatus } from "../types";
import { eventStorageLeftBytes, formatEventStorage, formatStorageBytes } from "../utils";

// Event photos upload as picked: no crop step and no re-encode, so group shots
// and portraits keep their original aspect ratio. Only avatars and covers crop.
// A selectionLimit of 0 allows as many as the platform's picker does; the
// storage check before uploading is what bounds a selection.
const PICKER_OPTIONS: ImagePicker.ImagePickerOptions = {
  mediaTypes: ["images"],
  quality: 1,
  allowsMultipleSelection: true,
  selectionLimit: 0,
};

type PhotoContentType = EventPhotoFile["contentType"];

const MIME_TYPES_BY_EXTENSION: Record<string, PhotoContentType> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
};

const PHOTO_CONTENT_TYPES = new Set<string>(Object.values(MIME_TYPES_BY_EXTENSION));

const isPhotoContentType = (value: string): value is PhotoContentType => PHOTO_CONTENT_TYPES.has(value);

/**
 * The picker's own mimeType when it reports one. Otherwise the file extension,
 * case-insensitively: iOS names camera-roll files `IMG_0001.HEIC`. Anything the
 * API does not list is sent as JPEG.
 */
const photoContentType = (asset: ImagePicker.ImagePickerAsset): PhotoContentType => {
  const extension = asset.uri.split(".").pop()?.toLowerCase() ?? "";
  const reported = asset.mimeType?.toLowerCase() ?? MIME_TYPES_BY_EXTENSION[extension];
  return reported && isPhotoContentType(reported) ? reported : "image/jpeg";
};

/**
 * The file's length on disk, which is what gets uploaded. The picker's
 * fileSize is the fallback; the upload checks the real bytes against it again.
 */
const photoSizeBytes = (asset: ImagePicker.ImagePickerAsset): number => {
  try {
    const size = new File(asset.uri).size;
    if (size > 0) return size;
  } catch {
    // Not a file:// URI the file system can stat.
  }
  return asset.fileSize ?? 0;
};

const uploadedSummary = (uploaded: number, total: number) =>
  total === 1
    ? uploaded === 1
      ? "Your photo was uploaded."
      : "Your photo wasn't uploaded."
    : `${uploaded} of ${total} photos uploaded.`;

export const useEventDetailScreen = () => {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const eventId = Array.isArray(id) ? id[0] : id;
  const { user } = useAuth();

  const eventQuery = useEventQuery(eventId);
  const photosQuery = useEventPhotosQuery(eventId);
  const participantsQuery = useEventParticipantsQuery(eventId);

  const leaveEventMutation = useLeaveEventMutation();
  const removeParticipantMutation = useRemoveEventParticipantMutation(eventId ?? "");
  const uploadPhotosMutation = useUploadEventPhotosMutation();
  const deletePhotoMutation = useDeleteEventPhotoMutation();

  const [membersSheetVisible, setMembersSheetVisible] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<PhotoUploadStatus | null>(null);

  const event = eventQuery.data ?? null;
  const photos = photosQuery.data ?? [];
  const participants = participantsQuery.data ?? [];
  const failedUploads = useFailedPhotoUploads(eventId);

  const currentParticipant = participants.find((participant) => participant.userId === user?.id);
  const isAdmin = event?.creatorId === user?.id || currentParticipant?.accessLevel === "ORGANIZER";

  const isLoading = eventQuery.isLoading || photosQuery.isLoading || participantsQuery.isLoading;
  const refreshing = eventQuery.isRefetching || photosQuery.isRefetching || participantsQuery.isRefetching;

  useEffect(() => {
    if (!eventQuery.isError) return;
    Alert.alert("Error", getErrorMessage(eventQuery.error, "Failed to load event details"));
    router.back();
  }, [eventQuery.isError, eventQuery.errorUpdatedAt, eventQuery.error, router]);

  const onRefresh = () => {
    void Promise.all([eventQuery.refetch(), photosQuery.refetch(), participantsQuery.refetch()]);
  };

  const handleOpenSettings = () => {
    if (!eventId) return;
    router.push(`/events/${eventId}/settings`);
  };

  /**
   * Uploads the files and keeps the ones that did not upload as failed tiles in
   * the gallery, ahead of any still failed from before. A file the picker could
   * not measure is never sent and goes straight to the failed list.
   */
  const uploadFiles = async (eventId: string, files: EventPhotoFile[]) => {
    const total = files.length;
    const measured = files.filter((file) => file.sizeBytes > 0);
    const keepFailed = (failed: Set<EventPhotoFile>) => {
      const sent = new Set(files.map((file) => file.uri));
      setFailedPhotoUploads(eventId, [
        ...files.filter((file) => file.sizeBytes <= 0 || failed.has(file)),
        ...getFailedPhotoUploads(eventId).filter((file) => !sent.has(file.uri)),
      ]);
    };

    setUploadStatus({ phase: "uploading", done: 0, total });
    try {
      const { uploaded, failed, error } = await uploadPhotosMutation.mutateAsync({
        eventId,
        files: measured,
        // Files that could not be measured were never sent, so they count as done.
        onProgress: ({ done }) => setUploadStatus({ phase: "uploading", done: done + total - measured.length, total }),
      });
      keepFailed(new Set(failed));

      if (error) {
        Alert.alert(
          "Upload Stopped",
          `${getErrorMessage(error, "Failed to upload photos.")} ${uploadedSummary(uploaded, total)}`,
        );
      } else if (uploaded === total) {
        Alert.alert("Success", total === 1 ? "Photo uploaded successfully!" : `${total} photos uploaded successfully!`);
      }
    } catch (error) {
      keepFailed(new Set(files));
      Alert.alert("Error", getErrorMessage(error, "Failed to upload photos"));
    }
  };

  const handleUploadImage = async () => {
    if (!eventId) return;

    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) {
        Alert.alert("Permission Required", "Please grant photo library access to upload images.");
        return;
      }

      // Set before the picker opens: once the member taps Add, iOS copies every
      // selected photo into the app before the picker returns, which takes
      // seconds for a large selection. The button shows it from the moment the
      // picker closes.
      setUploadStatus({ phase: "preparing" });
      const result = await ImagePicker.launchImageLibraryAsync(PICKER_OPTIONS);
      if (result.canceled || !result.assets?.length) return;

      const total = result.assets.length;
      const files: EventPhotoFile[] = result.assets.map((asset) => ({
        uri: asset.uri,
        contentType: photoContentType(asset),
        sizeBytes: photoSizeBytes(asset),
      }));

      const selectedBytes = files.reduce((sum, file) => sum + file.sizeBytes, 0);
      const storageLeft = event ? eventStorageLeftBytes(event) : null;
      if (storageLeft !== null && selectedBytes > storageLeft) {
        Alert.alert(
          "Not Enough Storage",
          `${total === 1 ? "This photo needs" : `These ${total} photos need`} ${formatStorageBytes(selectedBytes)}, but this gallery has ${formatStorageBytes(storageLeft)} left.`,
        );
        return;
      }

      await uploadFiles(eventId, files);
    } catch (error) {
      Alert.alert("Error", getErrorMessage(error, "Failed to upload photos"));
    } finally {
      setUploadStatus(null);
    }
  };

  const retryUploads = async (files: EventPhotoFile[]) => {
    if (!eventId || uploadStatus) return;
    try {
      await uploadFiles(eventId, files);
    } finally {
      setUploadStatus(null);
    }
  };

  /** A failed tile offers what a failed message does: send it again, or drop it. */
  const handleFailedUploadPress = (uri: string) => {
    if (!eventId || uploadStatus) return;
    const file = failedUploads.find((entry) => entry.uri === uri);
    if (!file) return;

    Alert.alert("Photo Not Uploaded", "This photo couldn't be uploaded.", [
      { text: "Retry", onPress: () => void retryUploads([file]) },
      ...(failedUploads.length > 1
        ? [{ text: `Retry All (${failedUploads.length})`, onPress: () => void retryUploads(failedUploads) }]
        : []),
      {
        text: "Remove",
        style: "destructive" as const,
        onPress: () =>
          setFailedPhotoUploads(
            eventId,
            getFailedPhotoUploads(eventId).filter((entry) => entry.uri !== uri),
          ),
      },
      { text: "Cancel", style: "cancel" as const },
    ]);
  };

  const handleLeaveEvent = () => {
    if (!eventId) return;

    Alert.alert("Leave Event", "Are you sure you want to leave this event?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Leave",
        style: "destructive",
        onPress: () => {
          leaveEventMutation.mutate(eventId, {
            onSuccess: () => {
              Alert.alert("Success", "You have left the event");
              router.replace("/events");
            },
            onError: (error) => {
              Alert.alert("Error", getErrorMessage(error, "Failed to leave event"));
            },
          });
        },
      },
    ]);
  };

  const handleDeletePhoto = (photo: PhotoResponseDto) => {
    if (!eventId) return;

    const canDelete = isAdmin || photo.addedById === user?.id;
    if (!canDelete) {
      Alert.alert("Permission Denied", "You can only delete your own photos");
      return;
    }

    Alert.alert("Delete Photo", "Are you sure you want to delete this photo?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          deletePhotoMutation.mutate(
            { eventId, photoId: photo.id },
            {
              onSuccess: () => {
                Alert.alert("Success", "Photo deleted successfully");
              },
              onError: (error) => {
                Alert.alert("Error", getErrorMessage(error, "Failed to delete photo"));
              },
            },
          );
        },
      },
    ]);
  };

  const handleRemoveMember = (participantUserId: string) => {
    if (!eventId) return;

    const participant = participants.find((entry) => entry.userId === participantUserId);
    setMembersSheetVisible(false);

    Alert.alert(
      "Remove Member",
      `Are you sure you want to remove ${participant?.username ? `@${participant.username}` : participant?.name || "this member"} from the event?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => {
            removeParticipantMutation.mutate(participantUserId, {
              onSuccess: () => {
                Alert.alert("Success", "Member removed successfully");
              },
              onError: (error) => {
                Alert.alert("Error", getErrorMessage(error, "Failed to remove member"));
              },
            });
          },
        },
      ],
    );
  };

  const handleDownloadPhoto = async (photo: PhotoResponseDto) => {
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission Required", "Please grant media library access to download photos.");
        return;
      }

      const downloadedFile = await File.downloadFileAsync(photo.url, Paths.cache);
      await MediaLibrary.createAssetAsync(downloadedFile.uri);
      Alert.alert("Success", "Photo downloaded successfully!");
    } catch (error) {
      Alert.alert("Error", getErrorMessage(error, "Failed to download photo"));
    }
  };

  return {
    event,
    photos,
    participants,
    isLoading,
    refreshing,
    isAdmin,
    currentUserId: user?.id,
    uploadStatus,
    failedUploads,
    storageLabel: event ? formatEventStorage(event) : null,
    membersSheetVisible,
    onRefresh,
    handleOpenSettings,
    handleUploadImage,
    handleFailedUploadPress,
    handleLeaveEvent,
    handleDeletePhoto,
    handleRemoveMember,
    handleDownloadPhoto,
    handleOpenMembers: () => setMembersSheetVisible(true),
    handleCloseMembers: () => setMembersSheetVisible(false),
  };
};
