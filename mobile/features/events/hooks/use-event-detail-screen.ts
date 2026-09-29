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
  useUploadEventPhotoMutation,
} from "../api/mutations";
import { useEventParticipantsQuery, useEventPhotosQuery, useEventQuery } from "../api/queries";
import type { PhotoResponseDto } from "../types";

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
  const uploadPhotoMutation = useUploadEventPhotoMutation();
  const deletePhotoMutation = useDeleteEventPhotoMutation();

  const [membersSheetVisible, setMembersSheetVisible] = useState(false);

  const event = eventQuery.data ?? null;
  const photos = photosQuery.data ?? [];
  const participants = participantsQuery.data ?? [];

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

  const handleUploadImage = async () => {
    if (!eventId) return;

    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) {
        Alert.alert("Permission Required", "Please grant photo library access to upload images.");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });

      if (result.canceled || !result.assets?.[0]) return;

      const asset = result.assets[0];
      const uriParts = asset.uri.split(".");
      const fileType = uriParts[uriParts.length - 1] || "jpg";
      const fileName = `event_photo_${Date.now()}.${fileType}`;
      const mimeType = `image/${fileType}`;

      await uploadPhotoMutation.mutateAsync({
        eventId,
        uri: asset.uri,
        fileName,
        mimeType,
      });
      Alert.alert("Success", "Photo uploaded successfully!");
    } catch (error) {
      Alert.alert("Error", getErrorMessage(error, "Failed to upload photo"));
    }
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
    isUploadingPhoto: uploadPhotoMutation.isPending,
    membersSheetVisible,
    onRefresh,
    handleOpenSettings,
    handleUploadImage,
    handleLeaveEvent,
    handleDeletePhoto,
    handleRemoveMember,
    handleDownloadPhoto,
    handleOpenMembers: () => setMembersSheetVisible(true),
    handleCloseMembers: () => setMembersSheetVisible(false),
  };
};
