import { AppIcon } from "@/components/ui/app-icon";
import { ThemedText } from "@/components/ui/themed-text";
import { Funnel } from "lucide-react-native";
import { Pressable, View } from "react-native";

type EventsListFiltersButtonProps = {
  onPress: () => void;
  active?: boolean;
};

export const EventsListFiltersButton = ({ onPress, active = false }: EventsListFiltersButtonProps) => (
  <Pressable
    accessibilityRole="button"
    accessibilityLabel="Filters"
    accessibilityState={{ selected: active }}
    onPress={onPress}
    className={`self-start rounded-xl border px-4 py-2.5 ${active ? "border-strong bg-surface" : "border-border bg-background"}`}
  >
    <View className="flex-row items-center gap-2">
      <AppIcon icon={Funnel} size="sm" color="#64748B" />
      <ThemedText className="text-sm font-medium">{active ? "Filters · On" : "Filters"}</ThemedText>
    </View>
  </Pressable>
);
