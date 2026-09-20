import { KeyboardAvoidingView, Platform } from "react-native";
import { ThemedView } from "@/components/themed-view";
import { CreateEventForm } from "../components/create-event-form";
import { useCreateEventScreen } from "../hooks/use-create-event-screen";

const CreateEventScreen = () => {
  const { form, onSubmit, ...screen } = useCreateEventScreen();
  return (
    <ThemedView className="flex-1">
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <CreateEventForm
          {...screen}
          control={form.control}
          isSubmitting={form.formState.isSubmitting}
          error={form.formState.errors.root?.server?.message}
          onSubmit={onSubmit}
        />
      </KeyboardAvoidingView>
    </ThemedView>
  );
};

export default CreateEventScreen;
