import { useColorScheme } from "@/hooks/use-color-scheme";
import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

type EventActionCardProps = {
  title: string;
  description: string;
  onPress: () => void;
};

const EventActionCard = ({ title, description, onPress }: EventActionCardProps) => {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const icon = title === "Join Event" ? "qr-code-outline" : "add-circle-outline";

  return (
    <TouchableOpacity
      style={[styles.card, isDark ? styles.cardDark : styles.cardLight]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <View style={[styles.iconContainer, isDark ? styles.iconContainerDark : styles.iconContainerLight]}>
        <Ionicons name={icon as any} size={24} color="#6366F1" />
      </View>

      <View>
        <Text style={[styles.title, isDark ? styles.textDark : styles.textLight]}>{title}</Text>
        <Text style={[styles.description, isDark ? styles.descriptionDark : styles.descriptionLight]}>
          {description}
        </Text>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    flex: 1,
    padding: 16,
    borderRadius: 8,
    gap: 12,
  },
  cardLight: {
    backgroundColor: "#FFFFFF",
  },
  cardDark: {
    backgroundColor: "#1F2937",
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  iconContainerLight: {
    backgroundColor: "#EEF2FF",
  },
  iconContainerDark: {
    backgroundColor: "rgba(99, 102, 241, 0.2)",
  },
  title: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 4,
  },
  description: {
    fontSize: 14,
  },
  descriptionLight: {
    color: "#6B7280",
  },
  descriptionDark: {
    color: "#9CA3AF",
  },
  textLight: {
    color: "#111827",
  },
  textDark: {
    color: "#F9FAFB",
  },
});

export default EventActionCard;
