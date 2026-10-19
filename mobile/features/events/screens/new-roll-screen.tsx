import { BottomSheet } from "@/components/ui/bottom-sheet/bottom-sheet";
import { Button } from "@/components/ui/button";
import { EdgePrint, EdgeValue } from "@/components/ui/edge-print";
import { FilmGrain } from "@/components/ui/film-grain";
import { IconButton } from "@/components/ui/icon-button";
import { SafeAreaView } from "@/components/ui/safe-area-view";
import { Spinner } from "@/components/ui/spinner";
import { TopBar } from "@/components/ui/top-bar";
import { colorTokens } from "@/theme/tokens";
import { X } from "phosphor-react-native";
import { Controller } from "react-hook-form";
import { Trans, useTranslation } from "react-i18next";
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from "react-native";
import { FilmChoice } from "../components/film-choice";
import { GuestLine } from "../components/guest-line";
import { RollLabel } from "../components/roll-label";
import { WhenSlip } from "../components/when-slip";
import { useNewRollScreen } from "../hooks/use-new-roll-screen";

/** 04.1–04.4 Load a roll: name it, say when, choose the film. Opened from New roll on Home. */
const NewRollScreen = () => {
  const { t } = useTranslation("create");
  const {
    status,
    onRetry,
    form,
    canLoad,
    isLoading,
    error,
    onLoad,
    label,
    guestLineRef,
    showGuestLine,
    onNameSubmit,
    film,
    when,
    onClose,
  } = useNewRollScreen();

  return (
    <SafeAreaView className="flex-1 bg-ground">
      <TopBar
        title={t("title")}
        left={
          <IconButton accessibilityLabel={t("close")} onPress={onClose}>
            <X size={18} weight="bold" color={colorTokens.text} />
          </IconButton>
        }
      />

      {status === "loading" ? (
        <View testID="new-roll-loading" className="flex-1 items-center justify-center">
          <Spinner />
        </View>
      ) : status === "notReady" ? (
        <View className="flex-1 justify-between px-5 pb-1 pt-5">
          <View className="gap-3">
            <EdgePrint>{t("notReady.edge")}</EdgePrint>
            <Text className="font-sans text-body text-text-2">{t("notReady.body")}</Text>
          </View>
          <Button title={t("notReady.retry")} mark="↻" onPress={onRetry} />
        </View>
      ) : (
        <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <ScrollView className="flex-1" contentContainerClassName="px-5 pb-6 pt-5" keyboardShouldPersistTaps="handled">
            <Controller
              control={form.control}
              name="title"
              render={({ field }) => (
                <RollLabel
                  stock={t("label.stock")}
                  placeholder={t("label.namePlaceholder")}
                  nameA11y={t("label.nameA11y")}
                  value={field.value}
                  onChangeText={field.onChange}
                  onBlur={field.onBlur}
                  onSubmitEditing={onNameSubmit}
                  editable={!isLoading}
                  when={label.when}
                  editLabel={label.editLabel}
                  editA11y={label.editA11y}
                  onEditWhen={when.onOpen}
                />
              )}
            />

            {showGuestLine ? (
              <View className="mt-10.5">
                <Controller
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <GuestLine
                      ref={guestLineRef}
                      label={t("guests.label")}
                      placeholder={t("guests.placeholder")}
                      accessibilityLabel={t("guests.a11y")}
                      value={field.value}
                      onChangeText={field.onChange}
                      onBlur={field.onBlur}
                      editable={!isLoading}
                    />
                  )}
                />
              </View>
            ) : null}

            <View className="mt-15.5">
              <FilmChoice
                heading={t("film.heading")}
                unit={t("film.dayRoll")}
                options={film.options}
                selected={film.selected}
                onSelect={film.onSelect}
                circled={film.circled}
                develops={
                  film.closes ? (
                    <Trans
                      t={t}
                      i18nKey="film.develops"
                      values={{ opens: film.opens, closes: film.closes }}
                      components={{ value: <EdgeValue>{null}</EdgeValue> }}
                    />
                  ) : (
                    t("film.developsOpen", { opens: film.opens })
                  )
                }
              />
            </View>
          </ScrollView>

          <View className="gap-2.5 px-5 pb-1 pt-3">
            {error ? (
              <Text accessibilityRole="alert" className="font-sans text-body text-pencil">
                {error}
              </Text>
            ) : null}
            <Button title={t("load")} mark="▸" onPress={onLoad} isLoading={isLoading} disabled={!canLoad} />
          </View>
        </KeyboardAvoidingView>
      )}

      <FilmGrain />

      <BottomSheet visible={when.visible} onClose={when.onClose}>
        <WhenSlip edge={t("when.edge")} {...when.slip} />
      </BottomSheet>
    </SafeAreaView>
  );
};

export default NewRollScreen;
