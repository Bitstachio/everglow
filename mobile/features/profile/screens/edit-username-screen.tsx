import { SafeAreaView } from "@/components/ui/safe-area-view";
import { KeyboardAvoidingView, Platform } from "react-native";
import { EditUsernameForm } from "../components/edit-username-form";
import { useEditUsernameScreen } from "../hooks/use-edit-username-screen";

const EditUsernameScreen = () => {
  const { form, onSubmit, availability } = useEditUsernameScreen();

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["left", "right"]}>
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <EditUsernameForm
          control={form.control}
          isDirty={form.formState.isDirty}
          isSubmitting={form.formState.isSubmitting}
          availability={availability}
          error={form.formState.errors.root?.server?.message}
          onSubmit={onSubmit}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

export default EditUsernameScreen;
