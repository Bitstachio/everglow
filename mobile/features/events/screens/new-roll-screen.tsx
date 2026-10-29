import { BottomSheet } from "@/components/ui/bottom-sheet/bottom-sheet";
import { Button } from "@/components/ui/button";
import { EdgePrint, EdgeValue } from "@/components/ui/edge-print";
import { FilmGrain } from "@/components/ui/film-grain";
import { FilmStrip } from "@/components/ui/film-strip";
import { IconButton } from "@/components/ui/icon-button";
import { PencilNote } from "@/components/ui/pencil-note";
import { SafeAreaView } from "@/components/ui/safe-area-view";
import { Slip } from "@/components/ui/slip";
import { Spinner } from "@/components/ui/spinner";
import { TopBar } from "@/components/ui/top-bar";
import { colorTokens } from "@/theme/tokens";
import { X } from "phosphor-react-native";
import { Controller } from "react-hook-form";
import { Trans, useTranslation } from "react-i18next";
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from "react-native";
import { FilmChoice } from "../components/film-choice";
import { CoverCrop } from "../components/cover-crop";
import { CoverPrint } from "../components/cover-print";
import { GuestLine } from "../components/guest-line";
import { buildFrames } from "../components/roll-card";
import { RollLabel } from "../components/roll-label";
import { RollsInUse } from "../components/rolls-in-use";
import { WhenField } from "../components/when-field";
import { WhenSlip } from "../components/when-slip";
import { useNewRollScreen } from "../hooks/use-new-roll-screen";
import { useRollPreview } from "../hooks/use-roll-preview";
import type { Event } from "../types";

/** A roll in use (04.8): its strip, with the frame that frees a spot circled and a note under it. */
const RunningRoll = ({ event, note }: { event: Event; note?: string }) => {
  const photos = useRollPreview(event);
  const frames = buildFrames(event, photos);
  return (
    <View>
      <FilmStrip
        frames={
          note ? frames.map((frame, i) => (i === frames.length - 1 ? { ...frame, circled: true } : frame)) : frames
        }
      />
      {note ? (
        <View className="-mt-1.5 mr-5 self-end -rotate-4">
          <PencilNote>{note}</PencilNote>
        </View>
      ) : null}
    </View>
  );
};

/**
 * 04.1–04.8 Load a roll: name it, say when, choose the film, add a first
 * frame. Asks before throwing it away, and says so when every roll the plan
 * allows is running. Opened from New roll on Home.
 */
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
    whenField,
    guestLineRef,
    showGuestLine,
    onNameSubmit,
    film,
    cover,
    coverCrop,
    when,
    full,
    onBackToRolls,
    leave,
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
      ) : status === "full" && full ? (
        <>
          <RollsInUse
            edge={full.edge}
            title={full.title}
            dim={full.dim}
            body={
              <>
                {full.runs}{" "}
                {full.next ? (
                  <Trans
                    t={t}
                    i18nKey="full.frees"
                    values={full.next}
                    components={{ b: <Text className="font-sans-semibold text-text" /> }}
                  />
                ) : (
                  t("full.cutOne")
                )}
              </>
            }
          >
            {full.rolls.map(({ event, note }) => (
              <RunningRoll key={event.id} event={event} note={note} />
            ))}
          </RollsInUse>
          <View className="px-5 pb-1 pt-3">
            <Button title={t("full.back")} mark="‹" onPress={onBackToRolls} />
          </View>
        </>
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
                  cover={<CoverPrint preparingLabel={t("cover.preparing")} disabled={isLoading} {...cover} />}
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

            <View className="mt-10">
              <WhenField heading={t("when.heading")} disabled={isLoading} onPress={when.onOpen} {...whenField} />
            </View>

            <View className="mt-10">
              <FilmChoice
                heading={t("film.heading")}
                unit={t("film.dayRoll")}
                options={film.options}
                selected={film.selected}
                onSelect={film.onSelect}
                circled={film.circled}
                removed={
                  film.closes ? (
                    <Trans
                      t={t}
                      i18nKey="film.removed"
                      values={{ closes: film.closes }}
                      components={{ value: <EdgeValue>{null}</EdgeValue> }}
                    />
                  ) : undefined
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

      <CoverCrop {...coverCrop} />

      <BottomSheet visible={when.visible} onClose={when.onClose}>
        <WhenSlip edge={t("when.edge")} {...when.slip} />
      </BottomSheet>

      <BottomSheet visible={leave.visible} onClose={leave.onKeepEditing}>
        <Slip edge={t("leave.edge")} title={t("leave.title")} body={t("leave.body")}>
          <Button title={t("leave.keep")} mark="‹" onPress={leave.onKeepEditing} />
          <Button title={t("leave.throwAway")} variant="secondary" mark="✕" onPress={leave.onThrowAway} />
        </Slip>
      </BottomSheet>
    </SafeAreaView>
  );
};

export default NewRollScreen;
