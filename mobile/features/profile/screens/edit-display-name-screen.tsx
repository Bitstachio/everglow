import { SafeAreaView } from "@/components/ui/safe-area-view";
import { KeyboardAvoidingView, Platform } from "react-native";
import { EditDisplayNameForm } from "../components/edit-display-name-form";
import { useEditDisplayNameScreen } from "../hooks/use-edit-display-name-screen";

const EditDisplayNameScreen = () => {
  const { form, onSubmit } = useEditDisplayNameScreen();
  return (
    <SafeAreaView className="flex-1 bg-background" edges={["left", "right", "bottom"]}>
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <EditDisplayNameForm
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

export default EditDisplayNameScreen;
