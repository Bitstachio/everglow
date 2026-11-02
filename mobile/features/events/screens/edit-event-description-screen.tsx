import { FilmGrain } from "@/components/ui/film-grain";
import { SafeAreaView } from "@/components/ui/safe-area-view";
import { Spinner } from "@/components/ui/spinner";
import { BackButton, TopBar } from "@/components/ui/top-bar";
import { useTranslation } from "react-i18next";
import { KeyboardAvoidingView, Platform, View } from "react-native";
import { EditEventDescriptionForm } from "../components/edit-event-description-form";
import { useEditEventDescriptionScreen } from "../hooks/use-edit-event-description-screen";

/** Edit the optional note for guests from settings. */
const EditEventDescriptionScreen = () => {
  const { t } = useTranslation(["roll", "common"]);
  const { isLoading, form, onSubmit, onBack } = useEditEventDescriptionScreen();

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-ground">
        <Spinner label={t("common:actions.loading")} />
      </View>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-ground">
      <TopBar
        title={t("roll:settings.editNote.title")}
        left={<BackButton accessibilityLabel={t("common:actions.back")} onPress={onBack} />}
      />
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <EditEventDescriptionForm
          control={form.control}
          isDirty={form.formState.isDirty}
          isSubmitting={form.formState.isSubmitting}
          error={form.formState.errors.root?.server?.message}
          onSubmit={onSubmit}
          label={t("roll:settings.editNote.label")}
          placeholder={t("roll:settings.editNote.placeholder")}
          accessibilityLabel={t("roll:settings.editNote.a11y")}
          hint={t("roll:settings.editNote.hint")}
          saveLabel={t("roll:settings.editNote.save")}
        />
      </KeyboardAvoidingView>
      <FilmGrain />
    </SafeAreaView>
  );
};

export default EditEventDescriptionScreen;
