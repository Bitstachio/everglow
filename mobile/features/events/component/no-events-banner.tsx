import { useColorScheme } from "@/hooks/use-color-scheme";
import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";

const NoEventsBanner = () => {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";

  return (
    <View style={[styles.container, isDark ? styles.containerDark : styles.containerLight]}>
      <View style={[styles.iconContainer, isDark ? styles.iconContainerDark : styles.iconContainerLight]}>
        <Ionicons name="calendar-outline" size={32} color="#9CA3AF" />
      </View>
      <View style={styles.textContainer}>
        <Text style={[styles.title, isDark ? styles.textDark : styles.textLight]}>No events yet</Text>
        <Text style={[styles.subtitle, isDark ? styles.subtitleDark : styles.subtitleLight]}>
          Events you create or join will appear here
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: "dashed",
  },
  containerLight: {
    backgroundColor: "#F3F4F6",
    borderColor: "#D1D5DB",
  },
  containerDark: {
    backgroundColor: "#1F2937",
    borderColor: "#374151",
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  iconContainerLight: {
    backgroundColor: "#E5E7EB",
  },
  iconContainerDark: {
    backgroundColor: "#374151",
  },
  textContainer: {
    alignItems: "center",
    gap: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: "600",
  },
  subtitle: {
    fontSize: 14,
    textAlign: "center",
  },
  subtitleLight: {
    color: "#6B7280",
  },
  subtitleDark: {
    color: "#9CA3AF",
  },
  textLight: {
    color: "#374151",
  },
  textDark: {
    color: "#E5E7EB",
  },
});

export default NoEventsBanner;
