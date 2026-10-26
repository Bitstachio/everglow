import { Button } from "@/components/ui/button";
import { Display } from "@/components/ui/display";
import { EdgePrint } from "@/components/ui/edge-print";
import { FilmGrain } from "@/components/ui/film-grain";
import { IndexRow } from "@/components/ui/index-row";
import { OptionRow } from "@/components/ui/option-row";
import { SafeAreaView } from "@/components/ui/safe-area-view";
import { BackButton, TopBar } from "@/components/ui/top-bar";
import { useTranslation } from "react-i18next";
import { ScrollView, Text, View } from "react-native";
import { useDeleteAccountScreen } from "../hooks/use-delete-account-screen";

/** 14.11 Delete account: what happens to your frames, and to each roll you started. */
const DeleteAccountScreen = () => {
  const { t } = useTranslation(["you", "common"]);
  const { photos, rolls, showRolls, rollsFailed, isDeleting, onChoosePhotos, onRetryRolls, onDelete, onBack } =
    useDeleteAccountScreen();

  return (
    <SafeAreaView className="flex-1 bg-ground">
      <TopBar
        title={t("delete.edge")}
        left={<BackButton accessibilityLabel={t("common:actions.back")} onPress={onBack} />}
      />
      <ScrollView className="flex-1" contentContainerClassName="px-5 pb-6 pt-4">
        <Display dim={t("delete.titleDim")}>{t("delete.title")}</Display>

        <View className="mt-9.5">
          <EdgePrint>{t("delete.framesEdge")}</EdgePrint>
          <View accessibilityRole="radiogroup">
            <OptionRow
              title={t("delete.keep")}
              description={t("delete.keepBody")}
              selected={photos === "KEEP"}
              onPress={() => onChoosePhotos("KEEP")}
              disabled={isDeleting}
            />
            <OptionRow
              title={t("delete.remove")}
              description={t("delete.removeBody")}
              selected={photos === "DELETE"}
              onPress={() => onChoosePhotos("DELETE")}
              disabled={isDeleting}
            />
          </View>
        </View>

        {showRolls ? (
          <View className="mt-9.5">
            <EdgePrint className="mb-1">{t("delete.rollsEdge")}</EdgePrint>
            <Text className="mb-3 font-sans text-body text-text-2">{t("delete.rollsBody")}</Text>
            {rollsFailed ? (
              <View className="items-start gap-2">
                <Text className="font-sans text-body text-text-2">{t("delete.rollsFailed")}</Text>
                <Button
                  title={t("delete.retry")}
                  variant="ghost"
                  fullWidth={false}
                  className="-ml-2"
                  onPress={onRetryRolls}
                />
              </View>
            ) : (
              rolls.map((roll, index) => (
                <IndexRow
                  key={roll.id}
                  first={index === 0}
                  label={roll.title}
                  value={roll.fate === "deleted" ? t("delete.rollDeleted") : t("delete.rollStays")}
                  lit
                />
              ))
            )}
          </View>
        ) : null}
      </ScrollView>

      <View className="gap-2.5 px-5 pb-1 pt-3">
        <Button
          title={t("delete.confirm")}
          variant="danger"
          mark="✕"
          onPress={onDelete}
          disabled={!photos}
          isLoading={isDeleting}
        />
        <EdgePrint className="self-center">{photos ? t("delete.note") : t("delete.choose")}</EdgePrint>
      </View>
      <FilmGrain />
    </SafeAreaView>
  );
};

export default DeleteAccountScreen;
