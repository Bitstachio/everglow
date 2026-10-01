import { SafeAreaView } from "@/components/ui/safe-area-view";
import { ThemedText } from "@/components/ui/themed-text";
import { ScrollView } from "react-native";
import { ActiveEventsCard } from "../components/active-events-card";
import { useUsageScreen } from "../hooks/use-usage-screen";

const UsageScreen = () => {
  const limits = useUsageScreen();
  return (
    <SafeAreaView className="flex-1 bg-background" edges={["left", "right", "bottom"]}>
      <ScrollView className="flex-1" contentContainerClassName="gap-6 px-4 pt-4 pb-6">
        <ActiveEventsCard {...limits} />
        <ThemedText tone="muted" className="text-sm">
          Events you create count while their galleries are open; events you join never count. When a gallery closes or
          you delete an event, you can start another.
        </ThemedText>
      </ScrollView>
    </SafeAreaView>
  );
};

export default UsageScreen;
