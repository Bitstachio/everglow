import { Display } from "@/components/ui/display";
import { EdgePrint } from "@/components/ui/edge-print";
import { FilmGrain } from "@/components/ui/film-grain";
import { IndexRow } from "@/components/ui/index-row";
import { SafeAreaView } from "@/components/ui/safe-area-view";
import { Spinner } from "@/components/ui/spinner";
import { BackButton, TopBar } from "@/components/ui/top-bar";
import { useTranslation } from "react-i18next";
import { ScrollView, View } from "react-native";
import { useEventSettingsScreen } from "../hooks/use-event-settings-screen";

/** Roll settings for an upcoming or open roll. */
const EventSettingsScreen = () => {
  const { t } = useTranslation(["roll", "common"]);
  const screen = useEventSettingsScreen();

  if (screen.isLoading || !screen.event) {
    return (
      <View className="flex-1 items-center justify-center bg-ground">
        <Spinner label={t("roll:settings.loading")} />
      </View>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-ground">
      <TopBar
        title={t("roll:settings.title")}
        left={<BackButton accessibilityLabel={t("common:actions.back")} onPress={screen.onBack} />}
      />

      <ScrollView className="flex-1" contentContainerClassName="px-5 pb-8 pt-4">
        <Display>{screen.title}</Display>
        <EdgePrint className="mt-2">{screen.subtitle}</EdgePrint>

        <View className="mt-8">
          <IndexRow first label={t("roll:settings.name")} value={screen.nameValue} onPress={screen.onOpenName} />
          <IndexRow label={t("roll:settings.cover")} value={screen.coverValue} onPress={screen.onOpenCover} />
          <IndexRow label={t("roll:settings.note")} value={screen.noteValue} onPress={screen.onOpenNote} />
          <IndexRow
            label={t("roll:settings.when")}
            value={screen.whenValue}
            lit={!screen.scheduleLocked}
            onPress={screen.onOpenWhen}
          />
          <IndexRow
            label={t("roll:settings.film")}
            value={screen.filmValue}
            lit={!screen.scheduleLocked}
            onPress={screen.onOpenFilm}
          />
          <IndexRow label={t("roll:settings.storage")} value={screen.storageValue} />
          <IndexRow
            label={t("roll:settings.envelopes")}
            value={screen.envelopesValue}
            onPress={screen.onOpenEnvelopes}
          />
          <IndexRow muted label={t("roll:settings.delete")} value={screen.deleteValue} />
        </View>

        {screen.scheduleLocked ? (
          <EdgePrint className="mt-6">{t("roll:settings.scheduleLockedNote")}</EdgePrint>
        ) : null}
      </ScrollView>

      <FilmGrain />
    </SafeAreaView>
  );
};

export default EventSettingsScreen;
