import { SafeAreaView } from "@/components/ui/safe-area-view";
import { Spinner } from "@/components/ui/spinner";
import { KeyboardAvoidingView, Platform, View } from "react-native";
import { EditEventDescriptionForm } from "../components/edit-event-description-form";
import { useEditEventDescriptionScreen } from "../hooks/use-edit-event-description-screen";

const EditEventDescriptionScreen = () => {
  const { isLoading, form, onSubmit } = useEditEventDescriptionScreen();

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
        <EditEventDescriptionForm
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

export default EditEventDescriptionScreen;
