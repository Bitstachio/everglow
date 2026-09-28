import { SafeAreaView } from "@/components/ui/safe-area-view";
import { Spinner } from "@/components/ui/spinner";
import { KeyboardAvoidingView, Platform, View } from "react-native";
import { EditEventTitleForm } from "../components/edit-event-title-form";
import { useEditEventTitleScreen } from "../hooks/use-edit-event-title-screen";

const EditEventTitleScreen = () => {
  const { isLoading, form, onSubmit } = useEditEventTitleScreen();

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <Spinner label="Loading event" />
      </View>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["left", "right"]}>
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <EditEventTitleForm
          control={form.control}
          isDirty={form.formState.isDirty}
          isSubmitting={form.formState.isSubmitting}
          error={form.formState.errors.root?.server?.message}
          onSubmit={onSubmit}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

export default EditEventTitleScreen;
