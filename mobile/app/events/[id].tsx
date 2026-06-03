import { useColorScheme } from "@/hooks/use-color-scheme";
import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Event } from "@/features/events/types";
import {
  getEventById,
  updateEvent,
  deleteEvent,
  leaveEvent,
  getEventParticipants,
  removeUserFromEvent,
} from "@/lib/event";
import EditEventModal from "@/features/events/component/EditEventModal/EditEventModal";
import { useAuth } from "@/context/auth-context";
import * as ImagePicker from "expo-image-picker";
import { Photo, getPhotosByEvent, uploadPhoto, deletePhoto } from "@/lib/photo";
import { File, Paths } from "expo-file-system";
import * as MediaLibrary from "expo-media-library";

const EventDetailScreen = () => {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const { user } = useAuth();

  const [event, setEvent] = useState<Event | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [showMembersModal, setShowMembersModal] = useState(false);
  const [participants, setParticipants] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    try {
      setRefreshing(true);
      await fetchEventDetails(); // re-fetch your event, photos, participants
    } finally {
      setRefreshing(false);
    }
  };

  const fetchEventDetails = useCallback(async () => {
    try {
      setIsLoading(true);
      const eventData = await getEventById(Number(id));
      setEvent(eventData);

      // Fetch photos for the event
      const eventPhotos = await getPhotosByEvent(Number(id));
      setPhotos(eventPhotos);

      // Fetch participants
      const eventParticipants = await getEventParticipants(Number(id));
      setParticipants(eventParticipants);
    } catch (error: any) {
      console.error("Failed to fetch event details:", error);
      Alert.alert("Error", "Failed to load event details");
      router.back();
    } finally {
      setIsLoading(false);
    }
  }, [id, router]);

  useEffect(() => {
    if (id) {
      void fetchEventDetails();
    }
  }, [id, fetchEventDetails]);

  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString);
    return {
      date: date.toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
      }),
      time: date.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      }),
    };
  };

  const handleUploadImage = async () => {
    try {
      // Request permission
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permissionResult.granted) {
        Alert.alert("Permission Required", "Please grant photo library access to upload images.");
        return;
      }

      // Launch image picker
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: "images" as any,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets[0]) {
        setIsUploadingPhoto(true);
        const asset = result.assets[0];

        // Get file extension from URI
        const uriParts = asset.uri.split(".");
        const fileType = uriParts[uriParts.length - 1];
        const fileName = `event_photo_${Date.now()}.${fileType}`;
        const mimeType = `image/${fileType}`;

        // Upload photo
        await uploadPhoto(Number(id), asset.uri, fileName, mimeType);

        // Refetch event details and photos
        await fetchEventDetails();

        Alert.alert("Success", "Photo uploaded successfully!");
      }
    } catch (error: any) {
      console.error("Failed to upload photo:", error);
      Alert.alert("Error", error.response?.data?.message || "Failed to upload photo");
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const handleUpdateEvent = async (data: { title: string; description: string; date: string }) => {
    try {
      const updatedEvent = await updateEvent(Number(id), data);
      setEvent(updatedEvent);
      Alert.alert("Success", "Event updated successfully");
      setEditModalVisible(false);
    } catch (error: any) {
      console.error("Failed to update event:", error);
      throw new Error(error.response?.data?.message || "Failed to update event");
    }
  };

  const handleDeleteEvent = () => {
    Alert.alert("Delete Event", "Are you sure you want to delete this event? This action cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteEvent(Number(id));
            Alert.alert("Success", "Event deleted successfully");
            router.replace("/(tabs)/events");
          } catch (error: any) {
            console.error("Failed to delete event:", error);
            Alert.alert("Error", error.response?.data?.message || "Failed to delete event");
          }
        },
      },
    ]);
  };

  const handleLeaveEvent = () => {
    Alert.alert("Leave Event", "Are you sure you want to leave this event?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Leave",
        style: "destructive",
        onPress: async () => {
          try {
            await leaveEvent(Number(id));
            Alert.alert("Success", "You have left the event");
            router.replace("/(tabs)/events");
          } catch (error: any) {
            console.error("Failed to leave event:", error);
            Alert.alert("Error", error.response?.data?.message || "Failed to leave event");
          }
        },
      },
    ]);
  };

  const handleDeletePhoto = (photoId: number, photoUserId?: number) => {
    const canDelete = isAdmin || photoUserId === user?.id;

    if (!canDelete) {
      Alert.alert("Permission Denied", "You can only delete your own photos");
      return;
    }

    Alert.alert("Delete Photo", "Are you sure you want to delete this photo?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await deletePhoto(photoId);
            Alert.alert("Success", "Photo deleted successfully");
            await fetchEventDetails();
          } catch (error: any) {
            console.error("Failed to delete photo:", error);
            Alert.alert("Error", error.response?.data?.message || "Failed to delete photo");
          }
        },
      },
    ]);
  };

  const handleRemoveMember = (participantUserId: number) => {
    const participant = participants.find((p) => p.user_id === participantUserId);

    Alert.alert(
      "Remove Member",
      `Are you sure you want to remove ${participant?.user?.username || "this member"} from the event?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            try {
              await removeUserFromEvent(Number(id), participantUserId);
              Alert.alert("Success", "Member removed successfully");
              await fetchEventDetails();
            } catch (error: any) {
              console.error("Failed to remove member:", error);
              Alert.alert("Error", error.response?.data?.message || "Failed to remove member");
            }
          },
        },
      ],
    );
  };

  const handleDownloadSinglePhoto = async (photo: Photo) => {
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission Required", "Please grant media library access to download photos.");
        return;
      }

      const downloadedFile = await File.downloadFileAsync(photo.image_url, Paths.cache);

      await MediaLibrary.createAssetAsync(downloadedFile.uri);

      Alert.alert("Success", "Photo downloaded successfully!");
    } catch (error: any) {
      console.error("Failed to download photo:", error);
      Alert.alert("Error", "Failed to download photo");
    }
  };

  const isAdmin = event?.userAccessLevel === 0;

  const getAccessLevelLabel = (accessLevel: number) => {
    switch (accessLevel) {
      case 0:
        return "Admin";
      case 1:
        return "Contributor";
      case 2:
        return "Viewer";
      default:
        return accessLevel;
    }
  };

  if (isLoading) {
    return (
      <>
        <Stack.Screen options={{ title: "Event Details", headerBackTitle: "Back" }} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3B82F6" />
        </View>
      </>
    );
  }

  if (!event) {
    return null;
  }

  const { date, time } = formatDateTime(event.date);

  return (
    <>
      <Stack.Screen
        options={{
          title: "Event Details",
          headerBackTitle: "Back",
          headerRight: () =>
            isAdmin ? (
              <TouchableOpacity onPress={() => setEditModalVisible(true)} style={styles.editButton}>
                <Ionicons name="pencil" size={20} color="#3B82F6" />
              </TouchableOpacity>
            ) : null,
        }}
      />
      <View style={[styles.container, isDark ? styles.containerDark : styles.containerLight]}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={isDark ? "#F9FAFB" : "#111827"} />
          }
        >
          {/* Event Info Section */}
          <View style={[styles.infoCard, isDark ? styles.cardDark : styles.cardLight]}>
            <Text style={[styles.title, isDark ? styles.textDark : styles.textLight]}>{event.title}</Text>

            {/* Date & Time */}
            <View style={styles.infoRow}>
              <Ionicons name="calendar-outline" size={20} color="#6366F1" />
              <View style={styles.infoTextContainer}>
                <Text style={[styles.infoLabel, isDark ? styles.textMuted : styles.textMutedLight]}>Date & Time</Text>
                <Text style={[styles.infoText, isDark ? styles.textDark : styles.textLight]}>{date}</Text>
                <Text style={[styles.infoText, isDark ? styles.textDark : styles.textLight]}>{time}</Text>
              </View>
            </View>

            {/* Description */}
            {event.description && (
              <View style={styles.descriptionContainer}>
                <Text style={[styles.infoLabel, isDark ? styles.textMuted : styles.textMutedLight]}>Description</Text>
                <Text style={[styles.description, isDark ? styles.textDark : styles.textLight]}>
                  {event.description}
                </Text>
              </View>
            )}
          </View>

          {/* Photos Section */}
          <View style={styles.photosSection}>
            <View style={styles.photosSectionHeader}>
              <Text style={[styles.sectionTitle, isDark ? styles.textDark : styles.textLight]}>Event Photos</Text>
              <TouchableOpacity onPress={handleUploadImage} style={styles.uploadButton} disabled={isUploadingPhoto}>
                {isUploadingPhoto ? (
                  <ActivityIndicator size="small" color="#3B82F6" />
                ) : (
                  <>
                    <Ionicons name="add-circle" size={24} color="#3B82F6" />
                    <Text style={styles.uploadButtonText}>Add Photo</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>

            {photos.length === 0 ? (
              <View style={[styles.emptyPhotos, isDark ? styles.cardDark : styles.cardLight]}>
                <Ionicons name="images-outline" size={48} color={isDark ? "#6B7280" : "#9CA3AF"} />
                <Text style={[styles.emptyPhotosText, isDark ? styles.textMuted : styles.textMutedLight]}>
                  No photos yet
                </Text>
                <Text style={[styles.emptyPhotosSubtext, isDark ? styles.textMuted : styles.textMutedLight]}>
                  Add photos to share memories from this event
                </Text>
              </View>
            ) : (
              <View style={styles.photosGrid}>
                {photos.map((photo) => (
                  <View key={photo.id} style={styles.photoItem}>
                    <Image source={{ uri: photo.image_url }} style={styles.photoImage} />
                    <TouchableOpacity
                      style={styles.downloadPhotoButton}
                      onPress={() => handleDownloadSinglePhoto(photo)}
                    >
                      <Ionicons name="download-outline" size={18} color="#FFFFFF" />
                    </TouchableOpacity>
                    {(isAdmin || photo.added_by === user?.id || photo.user_id === user?.id) && (
                      <TouchableOpacity
                        style={styles.deletePhotoButton}
                        onPress={() => handleDeletePhoto(photo.id, photo.added_by || photo.user_id)}
                      >
                        <Ionicons name="trash-outline" size={18} color="#FFFFFF" />
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* Members Section */}
          {isAdmin && (
            <View style={styles.membersSection}>
              <View style={styles.membersSectionHeader}>
                <Text style={[styles.sectionTitle, isDark ? styles.textDark : styles.textLight]}>Members</Text>
                <TouchableOpacity onPress={() => setShowMembersModal(true)} style={styles.viewMembersButton}>
                  <Text style={styles.viewMembersButtonText}>View All ({participants.length})</Text>
                  <Ionicons name="chevron-forward" size={16} color="#3B82F6" />
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Action Buttons */}
          <View style={styles.actionsSection}>
            {isAdmin ? (
              <TouchableOpacity style={[styles.actionButton, styles.deleteButton]} onPress={handleDeleteEvent}>
                <Ionicons name="trash-outline" size={20} color="#FFFFFF" />
                <Text style={styles.deleteButtonText}>Delete Event</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={[styles.actionButton, styles.leaveButton]} onPress={handleLeaveEvent}>
                <Ionicons name="exit-outline" size={20} color="#FFFFFF" />
                <Text style={styles.leaveButtonText}>Leave Event</Text>
              </TouchableOpacity>
            )}
          </View>
        </ScrollView>

        {/* Members Modal */}
        <Modal
          visible={showMembersModal}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => setShowMembersModal(false)}
        >
          <View style={[styles.modalContainer, isDark ? styles.containerDark : styles.containerLight]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, isDark ? styles.textDark : styles.textLight]}>Event Members</Text>
              <TouchableOpacity onPress={() => setShowMembersModal(false)} style={styles.modalCloseButton}>
                <Ionicons name="close" size={24} color={isDark ? "#F9FAFB" : "#111827"} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.membersList}>
              {participants.map((participant) => (
                <View key={participant.id} style={[styles.memberItem, isDark ? styles.cardDark : styles.cardLight]}>
                  <View style={styles.memberInfo}>
                    <View style={styles.memberAvatar}>
                      <Ionicons name="person" size={20} color="#6366F1" />
                    </View>
                    <View style={styles.memberDetails}>
                      <Text style={[styles.memberName, isDark ? styles.textDark : styles.textLight]}>
                        {participant.user?.name || "Unknown User"}
                      </Text>
                      <Text style={[styles.memberEmail, isDark ? styles.textMuted : styles.textMutedLight]}>
                        {participant.user?.email}
                      </Text>
                      <View style={styles.memberBadge}>
                        <Text style={styles.memberBadgeText}>{getAccessLevelLabel(participant.access_level)}</Text>
                      </View>
                    </View>
                  </View>
                  {participant.access_level !== "owner" && (
                    <TouchableOpacity
                      style={styles.removeMemberButton}
                      onPress={() => {
                        setShowMembersModal(false);
                        setTimeout(() => handleRemoveMember(participant.user_id), 300);
                      }}
                    >
                      <Ionicons name="trash-outline" size={20} color="#EF4444" />
                    </TouchableOpacity>
                  )}
                </View>
              ))}
            </ScrollView>
          </View>
        </Modal>

        {/* Edit Modal */}
        {event && isAdmin && (
          <EditEventModal
            visible={editModalVisible}
            event={event}
            onClose={() => setEditModalVisible(false)}
            onSave={handleUpdateEvent}
          />
        )}
      </View>
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  containerLight: {
    backgroundColor: "#F9FAFB",
  },
  containerDark: {
    backgroundColor: "#111827",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  editButton: {
    width: 35,
    height: 35,
    borderRadius: 15,
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "600",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  scrollView: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  infoCard: {
    marginTop: 24,
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    gap: 20,
  },
  cardLight: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  cardDark: {
    backgroundColor: "#1F2937",
    borderWidth: 1,
    borderColor: "#374151",
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    lineHeight: 32,
  },
  infoRow: {
    flexDirection: "row",
    gap: 12,
    alignItems: "flex-start",
  },
  infoTextContainer: {
    flex: 1,
    gap: 4,
  },
  infoLabel: {
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  infoText: {
    fontSize: 16,
  },
  descriptionContainer: {
    gap: 8,
  },
  description: {
    fontSize: 16,
    lineHeight: 24,
  },
  photosSection: {
    gap: 16,
  },
  photosSectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "bold",
  },
  uploadButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: "#EFF6FF",
  },
  uploadButtonText: {
    color: "#3B82F6",
    fontSize: 14,
    fontWeight: "600",
  },
  emptyPhotos: {
    borderRadius: 16,
    padding: 40,
    alignItems: "center",
    gap: 8,
  },
  emptyPhotosText: {
    fontSize: 16,
    fontWeight: "600",
    marginTop: 8,
  },
  emptyPhotosSubtext: {
    fontSize: 14,
    textAlign: "center",
  },
  photosGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  photoItem: {
    width: "48%",
    aspectRatio: 1.5,
    borderRadius: 12,
    overflow: "hidden",
  },
  photoImage: {
    width: "100%",
    height: "100%",
    backgroundColor: "#E5E7EB",
  },
  downloadPhotoButton: {
    position: "absolute",
    bottom: 8,
    right: 8,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(59, 130, 246, 0.95)",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  deletePhotoButton: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(239, 68, 68, 0.95)",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  membersSection: {
    gap: 16,
    marginTop: 8,
  },
  membersSectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  viewMembersButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: "#EFF6FF",
  },
  viewMembersButtonText: {
    color: "#3B82F6",
    fontSize: 14,
    fontWeight: "600",
  },
  actionsSection: {
    marginTop: 24,
    gap: 12,
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
  },
  deleteButton: {
    backgroundColor: "#EF4444",
  },
  deleteButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  leaveButton: {
    backgroundColor: "#F59E0B",
  },
  leaveButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  modalContainer: {
    flex: 1,
    paddingTop: 60,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "bold",
  },
  modalCloseButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
  },
  membersList: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  memberItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  memberInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  memberAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#EEF2FF",
    justifyContent: "center",
    alignItems: "center",
  },
  memberDetails: {
    flex: 1,
    gap: 4,
  },
  memberName: {
    fontSize: 16,
    fontWeight: "600",
  },
  memberEmail: {
    fontSize: 13,
  },
  memberBadge: {
    alignSelf: "flex-start",
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: "#DBEAFE",
    marginTop: 4,
  },
  memberBadgeText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#1E40AF",
    textTransform: "uppercase",
  },
  removeMemberButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#FEE2E2",
  },
  textLight: {
    color: "#111827",
  },
  textDark: {
    color: "#F9FAFB",
  },
  textMutedLight: {
    color: "#6B7280",
  },
  textMuted: {
    color: "#9CA3AF",
  },
});

export default EventDetailScreen;
