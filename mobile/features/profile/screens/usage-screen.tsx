import { SafeAreaView } from "@/components/ui/safe-area-view";
import { ThemedText } from "@/components/ui/themed-text";
import { ScrollView } from "react-native";
import { StorageCard } from "../components/storage-card";
import { useUsageScreen } from "../hooks/use-usage-screen";

const UsageScreen = () => {
  const storage = useUsageScreen();
  return (
    <SafeAreaView className="flex-1 bg-background" edges={["left", "right", "bottom"]}>
      <ScrollView className="flex-1" contentContainerClassName="gap-6 px-4 pt-4 pb-6">
        <StorageCard {...storage} />
        <ThemedText tone="muted" className="text-sm">
          Purchasing additional storage is not supported in this version. Additional storage options will be available
          in a future update.
        </ThemedText>
      </ScrollView>
    </SafeAreaView>
  );
};

export default UsageScreen;
