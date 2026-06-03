import { KeyboardAvoidingView, Platform } from "react-native";

import { ThemedView } from "@/components/themed-view";
import CreateEventForm from "@/features/events/component/CreateEventForm/CreateEventForm";

export default function CreateEventScreen() {
  return (
    <ThemedView className="flex-1">
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <CreateEventForm />
      </KeyboardAvoidingView>
    </ThemedView>
  );
}
