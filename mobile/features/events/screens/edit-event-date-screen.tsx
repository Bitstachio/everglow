import { SafeAreaView } from "@/components/ui/safe-area-view";
import { Spinner } from "@/components/ui/spinner";
import { View } from "react-native";
import { EditEventDateForm } from "../components/edit-event-date-form";
import { useEditEventDateScreen } from "../hooks/use-edit-event-date-screen";

const EditEventDateScreen = () => {
  const { isLoading, form, onSubmit } = useEditEventDateScreen();

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <Spinner label="Loading event" />
      </View>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["left", "right"]}>
      <EditEventDateForm
        control={form.control}
        isDirty={form.formState.isDirty}
        isSubmitting={form.formState.isSubmitting}
        error={form.formState.errors.root?.server?.message}
        onSubmit={onSubmit}
      />
    </SafeAreaView>
  );
};

export default EditEventDateScreen;
