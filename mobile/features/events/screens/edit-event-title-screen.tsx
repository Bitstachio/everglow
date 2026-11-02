import { FilmGrain } from "@/components/ui/film-grain";
import { SafeAreaView } from "@/components/ui/safe-area-view";
import { Spinner } from "@/components/ui/spinner";
import { BackButton, TopBar } from "@/components/ui/top-bar";
import { useTranslation } from "react-i18next";
import { KeyboardAvoidingView, Platform, View } from "react-native";
import { EditEventTitleForm } from "../components/edit-event-title-form";
import { useEditEventTitleScreen } from "../hooks/use-edit-event-title-screen";

/** Edit the roll's name from settings. */
const EditEventTitleScreen = () => {
  const { t } = useTranslation(["roll", "common"]);
  const { isLoading, form, onSubmit, onBack } = useEditEventTitleScreen();

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
        title={t("roll:settings.editName.title")}
        left={<BackButton accessibilityLabel={t("common:actions.back")} onPress={onBack} />}
      />
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <EditEventTitleForm
          control={form.control}
          isDirty={form.formState.isDirty}
          isSubmitting={form.formState.isSubmitting}
          error={form.formState.errors.root?.server?.message}
          onSubmit={onSubmit}
          placeholder={t("roll:settings.editName.placeholder")}
          accessibilityLabel={t("roll:settings.editName.a11y")}
          hint={t("roll:settings.editName.hint")}
          saveLabel={t("roll:settings.editName.save")}
        />
      </KeyboardAvoidingView>
      <FilmGrain />
    </SafeAreaView>
  );
};

export default EditEventTitleScreen;
