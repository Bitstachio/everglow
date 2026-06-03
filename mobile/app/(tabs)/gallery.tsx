import { useColorScheme } from "@/hooks/use-color-scheme";
import { Ionicons } from "@expo/vector-icons";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { PanGestureHandler, State, GestureHandlerRootView } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { Photo, getAllPhotosFromUserEvents } from "@/lib/photo";
import { File, Paths } from "expo-file-system";
import * as MediaLibrary from "expo-media-library";

const { width } = Dimensions.get("window");
const imageSize = (width - 48) / 3; // 3 columns with padding

export default function GalleryScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const insets = useSafeAreaInsets();

  const [photos, setPhotos] = useState<Photo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedPhotos, setSelectedPhotos] = useState<Set<number>>(new Set());
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [viewingPhotoIndex, setViewingPhotoIndex] = useState<number | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  useFocusEffect(
    useCallback(() => {
      fetchPhotos();
    }, []),
  );

  const fetchPhotos = async () => {
    try {
      setIsLoading(true);
      const allPhotos = await getAllPhotosFromUserEvents();
      setPhotos(allPhotos);
    } catch (error: any) {
      console.error("Failed to fetch photos:", error);
      Alert.alert("Error", "Failed to load photos");
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchPhotos();
  }, []);

  const togglePhotoSelection = (photoId: number) => {
    const newSelected = new Set(selectedPhotos);
    if (newSelected.has(photoId)) {
      newSelected.delete(photoId);
    } else {
      newSelected.add(photoId);
    }
    setSelectedPhotos(newSelected);

    // Exit selection mode if no photos selected
    if (newSelected.size === 0) {
      setIsSelectionMode(false);
    }
  };

  const handleLongPress = (photoId: number) => {
    setIsSelectionMode(true);
    togglePhotoSelection(photoId);
  };

  const handlePhotoPress = (photo: Photo) => {
    if (isSelectionMode) {
      togglePhotoSelection(photo.id);
    } else {
      const idx = photos.findIndex((p) => p.id === photo.id);
      setViewingPhotoIndex(idx);
    }
  };

  const cancelSelection = () => {
    setIsSelectionMode(false);
    setSelectedPhotos(new Set());
  };

  const selectAll = () => {
    const allIds = new Set(photos.map((p) => p.id));
    setSelectedPhotos(allIds);
  };

  const downloadPhotos = async () => {
    try {
      // Request media library permissions
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission Required", "Please grant media library access to download photos.");
        return;
      }

      setIsDownloading(true);
      const photosToDownload = photos.filter((p) => selectedPhotos.has(p.id));

      for (const photo of photosToDownload) {
        // Download photo to cache directory using new API
        const downloadedFile = await File.downloadFileAsync(photo.image_url, Paths.cache);

        // Save to media library
        await MediaLibrary.createAssetAsync(downloadedFile.uri);
      }

      Alert.alert(
        "Success",
        `${photosToDownload.length} ${photosToDownload.length === 1 ? "photo" : "photos"} downloaded successfully!`,
      );
      cancelSelection();
    } catch (error: any) {
      console.error("Failed to download photos:", error);
      Alert.alert("Error", "Failed to download photos");
    } finally {
      setIsDownloading(false);
    }
  };

  const downloadSinglePhoto = async (photo: Photo) => {
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission Required", "Please grant media library access to download photos.");
        return;
      }

      setIsDownloading(true);

      // Download photo to cache directory using new API
      const downloadedFile = await File.downloadFileAsync(photo.image_url, Paths.cache);

      // Save to media library
      await MediaLibrary.createAssetAsync(downloadedFile.uri);

      Alert.alert("Success", "Photo downloaded successfully!");
      setViewingPhotoIndex(null);
    } catch (error: any) {
      console.error("Failed to download photo:", error);
      Alert.alert("Error", "Failed to download photo");
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View style={[styles.container, isDark ? styles.containerDark : styles.containerLight]}>
        {/* Header */}
        <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
          <View>
            <Text style={[styles.title, isDark ? styles.textDark : styles.textLight]}>Gallery</Text>
            <Text style={[styles.subtitle, isDark ? styles.textMuted : styles.textMutedLight]}>
              {photos.length} {photos.length === 1 ? "photo" : "photos"}
            </Text>
          </View>

          <View style={styles.headerActions}>
            {!isSelectionMode && (
              <TouchableOpacity onPress={() => setIsSelectionMode(true)} style={styles.headerButton}>
                <Text style={styles.headerButtonText}>Select</Text>
              </TouchableOpacity>
            )}
            {isSelectionMode && (
              <>
                <TouchableOpacity onPress={selectAll} style={styles.headerButton}>
                  <Text style={styles.headerButtonText}>Select All</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={cancelSelection} style={styles.headerButton}>
                  <Text style={styles.headerButtonText}>Cancel</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>

        {/* Photos Grid */}
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#3B82F6" />
            </View>
          ) : photos.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="images-outline" size={64} color={isDark ? "#6B7280" : "#9CA3AF"} />
              <Text style={[styles.emptyText, isDark ? styles.textMuted : styles.textMutedLight]}>No photos yet</Text>
              <Text style={[styles.emptySubtext, isDark ? styles.textMuted : styles.textMutedLight]}>
                Photos from your events will appear here
              </Text>
            </View>
          ) : (
            <View style={styles.grid}>
              {photos.map((photo) => (
                <Pressable
                  key={photo.id}
                  style={styles.photoContainer}
                  onPress={() => handlePhotoPress(photo)}
                  onLongPress={() => handleLongPress(photo.id)}
                >
                  <Image source={{ uri: photo.image_url }} style={styles.photo} />
                  {isSelectionMode && (
                    <View style={styles.selectionOverlay}>
                      <View
                        style={[
                          styles.checkbox,
                          selectedPhotos.has(photo.id) ? styles.checkboxSelected : styles.checkboxUnselected,
                        ]}
                      >
                        {selectedPhotos.has(photo.id) && <Ionicons name="checkmark" size={16} color="#FFFFFF" />}
                      </View>
                    </View>
                  )}
                </Pressable>
              ))}
            </View>
          )}
        </ScrollView>

        {/* Download FAB */}
        {isSelectionMode && selectedPhotos.size > 0 && (
          <TouchableOpacity
            style={[styles.fab, isDownloading && styles.fabDisabled]}
            onPress={downloadPhotos}
            disabled={isDownloading}
          >
            {isDownloading ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name="download" size={24} color="#FFFFFF" />
                <Text style={styles.fabText}>{selectedPhotos.size}</Text>
              </>
            )}
          </TouchableOpacity>
        )}

        {/* Full Image Modal with swipe navigation */}
        <Modal visible={viewingPhotoIndex !== null} transparent animationType="fade">
          <View style={styles.modalContainer}>
            <Pressable style={styles.modalBackdrop} onPress={() => setViewingPhotoIndex(null)} />
            {viewingPhotoIndex !== null && photos[viewingPhotoIndex] && (
              <>
                <View style={styles.modalHeader}>
                  <TouchableOpacity onPress={() => setViewingPhotoIndex(null)} style={styles.modalCloseButton}>
                    <Ionicons name="close" size={28} color="#FFFFFF" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => downloadSinglePhoto(photos[viewingPhotoIndex])}
                    style={styles.modalDownloadButton}
                    disabled={isDownloading}
                  >
                    {isDownloading ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Ionicons name="download" size={24} color="#FFFFFF" />
                    )}
                  </TouchableOpacity>
                </View>
                {/* Navigation buttons and image counter */}
                <View style={styles.modalNavContainer}>
                  <TouchableOpacity
                    style={[styles.modalNavButton, viewingPhotoIndex === 0 && styles.modalNavButtonDisabled]}
                    onPress={() => viewingPhotoIndex > 0 && setViewingPhotoIndex(viewingPhotoIndex - 1)}
                    disabled={viewingPhotoIndex === 0}
                  >
                    <Ionicons name="chevron-back" size={36} color="#FFFFFF" />
                  </TouchableOpacity>
                  <Text style={styles.modalNavText}>
                    {viewingPhotoIndex + 1} / {photos.length}
                  </Text>
                  <TouchableOpacity
                    style={[
                      styles.modalNavButton,
                      viewingPhotoIndex === photos.length - 1 && styles.modalNavButtonDisabled,
                    ]}
                    onPress={() => viewingPhotoIndex < photos.length - 1 && setViewingPhotoIndex(viewingPhotoIndex + 1)}
                    disabled={viewingPhotoIndex === photos.length - 1}
                  >
                    <Ionicons name="chevron-forward" size={36} color="#FFFFFF" />
                  </TouchableOpacity>
                </View>
                {/* Swipe navigation */}
                <PanGestureHandler
                  onHandlerStateChange={({ nativeEvent }) => {
                    if (nativeEvent.state === State.END) {
                      if (nativeEvent.translationX < -50 && viewingPhotoIndex < photos.length - 1) {
                        setViewingPhotoIndex(viewingPhotoIndex + 1);
                      } else if (nativeEvent.translationX > 50 && viewingPhotoIndex > 0) {
                        setViewingPhotoIndex(viewingPhotoIndex - 1);
                      }
                    }
                  }}
                >
                  <View style={{ flex: 1, width: "100%", justifyContent: "center", alignItems: "center" }}>
                    <Image
                      source={{ uri: photos[viewingPhotoIndex].image_url }}
                      style={styles.fullImage}
                      resizeMode="contain"
                    />
                  </View>
                </PanGestureHandler>
              </>
            )}
          </View>
        </Modal>
      </View>
    </GestureHandlerRootView>
  );
}

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
    paddingHorizontal: 24,
    paddingBottom: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
  },
  headerActions: {
    flexDirection: "row",
    gap: 12,
  },
  headerButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  headerButtonText: {
    color: "#3B82F6",
    fontSize: 16,
    fontWeight: "600",
  },
  scrollView: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 12,
    paddingBottom: 24,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingTop: 100,
  },
  emptyContainer: {
    alignItems: "center",
    paddingTop: 100,
    gap: 12,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: "600",
  },
  emptySubtext: {
    fontSize: 14,
    textAlign: "center",
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
  },
  photoContainer: {
    width: imageSize,
    height: imageSize,
    position: "relative",
  },
  photo: {
    width: "100%",
    height: "100%",
    backgroundColor: "#E5E7EB",
  },
  selectionOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.3)",
    justifyContent: "flex-start",
    alignItems: "flex-end",
    padding: 8,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
  },
  checkboxUnselected: {
    backgroundColor: "transparent",
    borderColor: "#FFFFFF",
  },
  checkboxSelected: {
    backgroundColor: "#3B82F6",
    borderColor: "#3B82F6",
  },
  fab: {
    position: "absolute",
    bottom: 24,
    right: 24,
    backgroundColor: "#3B82F6",
    borderRadius: 28,
    width: 56,
    height: 56,
    justifyContent: "center",
    alignItems: "center",
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    flexDirection: "row",
    gap: 4,
  },
  fabDisabled: {
    opacity: 0.6,
  },
  fabText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "bold",
  },
  modalContainer: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.95)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalBackdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  modalHeader: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 16,
    paddingTop: 60,
    zIndex: 1,
  },
  modalCloseButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalDownloadButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(59, 130, 246, 0.9)",
    justifyContent: "center",
    alignItems: "center",
  },
  fullImage: {
    width: "100%",
    height: "100%",
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
  modalNavContainer: {
    position: "absolute",
    bottom: 60,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 2,
    gap: 16,
  },
  modalNavButton: {
    padding: 8,
    opacity: 1,
  },
  modalNavButtonDisabled: {
    opacity: 0.3,
  },
  modalNavText: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "bold",
    marginHorizontal: 12,
  },
});
