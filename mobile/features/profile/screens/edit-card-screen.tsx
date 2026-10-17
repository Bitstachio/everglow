import { Button } from "@/components/ui/button";
import { FilmGrain } from "@/components/ui/film-grain";
import { SafeAreaView } from "@/components/ui/safe-area-view";
import { TopBar } from "@/components/ui/top-bar";
import { Controller } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";
import { EditLabCard } from "../components/edit-lab-card";
import { useEditCardScreen } from "../hooks/use-edit-card-screen";

/** 14.2 Edit the card. Name and photo are edited on the card itself. */
const EditCardScreen = () => {
  const { t } = useTranslation(["you", "onboarding"]);
  const {
    title,
    photoUri,
    photoCacheKey,
    username,
    form,
    hasAvatar,
    isUpdatingAvatar,
    onChangePhoto,
    onSave,
    onCancel,
  } = useEditCardScreen();
  const { isSubmitting, isDirty, errors } = form.formState;
  const error = errors.name?.message ?? errors.root?.server?.message;

  return (
    <SafeAreaView className="flex-1 bg-ground">
      <TopBar
        title={t("editCard.title")}
        left={<Button title={t("editCard.cancel")} variant="ghost" fullWidth={false} onPress={onCancel} />}
        right={
          <Button
            title={t("editCard.save")}
            variant="ghost"
            fullWidth={false}
            onPress={onSave}
            isLoading={isSubmitting}
            disabled={!isDirty || isUpdatingAvatar}
          />
        }
      />

      <View className="px-5.5 pt-4">
        <Controller
          control={form.control}
          name="name"
          render={({ field }) => (
            <EditLabCard
              title={title}
              photoUri={photoUri}
              photoCacheKey={photoCacheKey}
              isUpdatingPhoto={isUpdatingAvatar}
              photoBusyLabel={t("editCard.updatingPhoto")}
              nameLabel={t("onboarding:card.name")}
              namePlaceholder={t("editCard.namePlaceholder")}
              nameA11y={t("editCard.nameA11y")}
              usernameLabel={t("onboarding:card.signsAs")}
              username={username}
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              onSubmitEditing={onSave}
              editable={!isSubmitting}
            />
          )}
        />

        <View className="mt-17 items-start gap-2 px-2">
          <Button
            title={hasAvatar ? t("editCard.changePhoto") : t("editCard.addPhoto")}
            variant="ghost"
            fullWidth={false}
            className="ml-2.5"
            onPress={onChangePhoto}
            disabled={isUpdatingAvatar || isSubmitting}
          />
          {error ? (
            <Text accessibilityRole="alert" className="font-sans text-body text-pencil">
              {error}
            </Text>
          ) : null}
        </View>
      </View>

      <FilmGrain />
    </SafeAreaView>
  );
};

export default EditCardScreen;
