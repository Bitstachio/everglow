import { BottomSheet } from "@/components/ui/bottom-sheet/bottom-sheet";
import { Button } from "@/components/ui/button";
import { Display } from "@/components/ui/display";
import { EdgePrint, EdgeValue } from "@/components/ui/edge-print";
import { FilmGrain } from "@/components/ui/film-grain";
import { IndexRow } from "@/components/ui/index-row";
import { SafeAreaView } from "@/components/ui/safe-area-view";
import { Slip } from "@/components/ui/slip";
import { Spinner } from "@/components/ui/spinner";
import { BackButton, TopBar } from "@/components/ui/top-bar";
import { Trans, useTranslation } from "react-i18next";
import { ScrollView, Text, View } from "react-native";
import { CoverCrop } from "../components/cover-crop";
import { FilmChoice } from "../components/film-choice";
import { WhenSlip } from "../components/when-slip";
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

  const { when, film, deleteRoll } = screen;

  return (
    <SafeAreaView className="flex-1 bg-ground">
      <TopBar
        title={t("roll:settings.title")}
        left={<BackButton accessibilityLabel={t("common:actions.back")} onPress={screen.onBack} />}
      />

      <ScrollView className="flex-1" contentContainerClassName="px-5 pb-8 pt-4">
        <Display>{screen.title}</Display>
        <EdgePrint className="mt-2">{screen.subtitle}</EdgePrint>

        <View className="mt-10">
          <IndexRow first label={t("roll:settings.name")} value={screen.nameValue} onPress={screen.onOpenName} />
          <IndexRow
            label={t("roll:settings.cover")}
            value={screen.coverValue}
            disabled={screen.isUpdatingCover}
            onPress={screen.onOpenCover}
          />
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
          <IndexRow muted label={t("roll:settings.delete")} value={screen.deleteValue} onPress={screen.onOpenDelete} />
        </View>

        {screen.scheduleLocked && screen.event.galleryState === "OPEN" ? (
          <Text className="mt-14 font-sans text-body text-text-2">{t("roll:settings.scheduleLockedNote")}</Text>
        ) : null}
      </ScrollView>

      <FilmGrain />

      <CoverCrop {...screen.coverCrop} />

      <BottomSheet visible={when.visible} onClose={when.onClose}>
        <WhenSlip
          edge={when.edge}
          months={when.months}
          monthIndex={when.monthIndex}
          onMonthChange={when.onMonthChange}
          previous={when.previous}
          next={when.next}
          weekdays={when.weekdays}
          times={when.times}
          note={
            <View>
              {when.people ? <Text className="font-sans text-body text-text">{when.people}</Text> : null}
              {when.error ? (
                <Text accessibilityRole="alert" className="mt-1.5 font-sans text-body text-pencil">
                  {when.error}
                </Text>
              ) : null}
            </View>
          }
          setLabel={when.setLabel}
          onSet={when.onSet}
          isSetting={when.isSetting}
        />
      </BottomSheet>

      <BottomSheet visible={film.visible} onClose={film.onClose}>
        <FilmChoice
          heading={film.heading}
          unit={film.unit}
          options={film.options}
          selected={film.selected}
          onSelect={film.onSelect}
          circled={film.circled}
          removed={
            film.closes ? (
              <Trans
                t={t}
                i18nKey="roll:settings.editFilm.removed"
                values={{ closes: film.closes }}
                components={{ value: <EdgeValue>{null}</EdgeValue> }}
              />
            ) : undefined
          }
        />
        {film.error ? (
          <Text accessibilityRole="alert" className="mt-3 font-sans text-body text-pencil">
            {film.error}
          </Text>
        ) : null}
        <View className="mt-4">
          <Button
            title={film.saveLabel}
            mark="✓"
            onPress={film.onSave}
            isLoading={film.isSaving}
            disabled={film.isSaving || !film.canSave}
          />
        </View>
      </BottomSheet>

      <BottomSheet visible={deleteRoll.visible} onClose={deleteRoll.onClose}>
        <Slip edge={deleteRoll.edge} title={t("roll:settings.deleteRoll.title")} body={deleteRoll.body}>
          {deleteRoll.error ? (
            <Text accessibilityRole="alert" className="font-sans text-body text-pencil">
              {deleteRoll.error}
            </Text>
          ) : null}
          <Button
            title={deleteRoll.confirmLabel}
            variant="danger"
            mark="✕"
            onPress={deleteRoll.onConfirm}
            isLoading={deleteRoll.isDeleting}
          />
          <Button
            title={t("roll:settings.deleteRoll.cancel")}
            variant="secondary"
            mark="‹"
            onPress={deleteRoll.onClose}
          />
        </Slip>
      </BottomSheet>
    </SafeAreaView>
  );
};

export default EventSettingsScreen;
