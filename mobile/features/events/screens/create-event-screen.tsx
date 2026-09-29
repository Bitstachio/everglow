import { KeyboardAvoidingView, Platform, View } from "react-native";

import { CreateEventForm } from "../components/create-event-form";
import { useCreateEventScreen } from "../hooks/use-create-event-screen";

const CreateEventScreen = () => {
  const { form, onSubmit, ...screen } = useCreateEventScreen();
  return (
    <View className="flex-1 bg-background">
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <CreateEventForm
          {...screen}
          control={form.control}
          isSubmitting={form.formState.isSubmitting}
          error={form.formState.errors.root?.server?.message}
          onSubmit={onSubmit}
        />
      </KeyboardAvoidingView>
    </View>
  );
};

export default CreateEventScreen;
