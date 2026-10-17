import { Display } from "@/components/ui/display";
import { FilmGrain } from "@/components/ui/film-grain";
import { SafeAreaView } from "@/components/ui/safe-area-view";
import { BackButton, TopBar } from "@/components/ui/top-bar";
import { useWatch } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { KeyboardAvoidingView, Platform, Text, View } from "react-native";
import { EditUsernameForm } from "../components/edit-username-form";
import { useEditUsernameScreen } from "../hooks/use-edit-username-screen";

/** 14.3 Username; 14.4 when both changes are used and it says the date it opens again. */
const EditUsernameScreen = () => {
  const { t } = useTranslation(["you", "common"]);
  const { form, onSubmit, availability, currentUsername, opensOn, onBack } = useEditUsernameScreen();
  const username = useWatch({ control: form.control, name: "username" }) ?? "";

  return (
    <SafeAreaView className="flex-1 bg-ground">
      <TopBar
        title={t("username.title")}
        left={<BackButton accessibilityLabel={t("common:actions.back")} onPress={onBack} />}
      />
      {opensOn ? (
        <View className="px-5 pt-6">
          <View className="flex-row items-center gap-2 border-b-2 border-text pb-2">
            <Text className="font-display text-title-slip text-outline">@</Text>
            <Text className="font-display text-title-slip text-outline">{currentUsername}</Text>
          </View>
          <Display variant="slip" className="mt-7" dim={t("username.laterTitleDim", { date: opensOn })}>
            {t("username.laterTitle")}
          </Display>
          <Text className="mt-3 font-sans text-body text-text-2">{t("username.laterBody")}</Text>
        </View>
      ) : (
        <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <EditUsernameForm
            control={form.control}
            username={username}
            isDirty={form.formState.isDirty}
            isSubmitting={form.formState.isSubmitting}
            availability={availability}
            fieldError={form.formState.errors.username?.message}
            error={form.formState.errors.root?.server?.message}
            onSubmit={onSubmit}
          />
        </KeyboardAvoidingView>
      )}
      <FilmGrain />
    </SafeAreaView>
  );
};

export default EditUsernameScreen;
