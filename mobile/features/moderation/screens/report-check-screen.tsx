import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Display } from "@/components/ui/display";
import { EdgePrint } from "@/components/ui/edge-print";
import { FilmGrain } from "@/components/ui/film-grain";
import { Monochrome } from "@/components/ui/monochrome";
import { RetryingPhoto } from "@/components/ui/retrying-photo";
import { SafeAreaView } from "@/components/ui/safe-area-view";
import { Spinner } from "@/components/ui/spinner";
import { BackButton, TopBar } from "@/components/ui/top-bar";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useReportCheckScreen } from "../hooks/use-report-check-screen";

/** A label and its value on a ruled line. A reporter's note is their own words, so it stays in plain type. */
const Fact = ({ label, value, words = false }: { label: string; value: string; words?: boolean }) => (
  <View className="min-h-11 flex-row items-center justify-between gap-4 border-b border-line py-2.5">
    <EdgePrint>{label}</EdgePrint>
    {words ? (
      <Text className="shrink text-right font-sans text-body text-text">{value}</Text>
    ) : (
      <EdgePrint tone="text" className="shrink text-right" numberOfLines={2}>
        {value}
      </EdgePrint>
    )}
  </View>
);

/** 10.9 Decide, and 10.10 Went to Everglow. */
const ReportCheckScreen = () => {
  const { t } = useTranslation(["report", "common"]);
  const screen = useReportCheckScreen();

  const print =
    screen.kind === "frame" ? (
      screen.withEverglow ? (
        <View className="aspect-square items-center justify-center bg-frame-empty">
          <EdgePrint>{t("everglow.hidden")}</EdgePrint>
        </View>
      ) : (
        <Pressable
          accessibilityRole="imagebutton"
          accessibilityLabel={t("decide.lookLabel")}
          disabled={screen.revealed}
          onPress={screen.onReveal}
          className="aspect-square overflow-hidden bg-frame-empty"
        >
          <RetryingPhoto
            uri={(screen.revealed ? screen.photo?.url : screen.photo?.thumbnailUrl) ?? undefined}
            cacheKey={screen.photo ? `photo:${screen.photo.id}:${screen.revealed ? "original" : "thumbnail"}` : undefined}
            className="h-full w-full"
            contentFit="cover"
            blurRadius={screen.revealed ? 0 : 40}
          />
          {screen.revealed ? null : (
            <View pointerEvents="none" className="absolute inset-0 items-center justify-center">
              <EdgePrint tone="text">{t("decide.tapToLook")}</EdgePrint>
            </View>
          )}
        </Pressable>
      )
    ) : (
      <Monochrome className="aspect-square overflow-hidden bg-frame-empty">
        {screen.subject ? (
          <Avatar
            userId={screen.subject.userId}
            name={screen.subject.name}
            uri={screen.subject.avatarUrl}
            size="fill"
          />
        ) : null}
      </Monochrome>
    );

  const body = screen.isLoading ? (
    <Spinner label={t("common:actions.loading")} />
  ) : screen.isGone ? (
    <Text className="font-sans text-body text-text-2">{t("decide.gone")}</Text>
  ) : (
    <>
      <View className="px-5">{print}</View>
      {screen.withEverglow ? (
        <View className="mt-6 gap-3">
          <Display variant="slip" dim={t("everglow.titleDim")}>
            {t("everglow.title")}
          </Display>
          <Text className="font-sans text-body text-text-2">
            {screen.kind === "frame" ? t("everglow.bodyFrame") : t("everglow.bodyPerson")}
          </Text>
        </View>
      ) : (
        <View className="mt-6">
          <Fact label={t("decide.reason")} value={screen.reasonValue} />
          <Fact label={screen.kind === "frame" ? t("decide.addedBy") : t("decide.person")} value={screen.addedByValue} />
          {screen.notes.map((note, index) => (
            <Fact key={index} words label={t("decide.note")} value={note} />
          ))}
        </View>
      )}
    </>
  );

  const actions = screen.isGone ? (
    <Button title={t("everglow.ok")} variant="secondary" mark="‹" onPress={screen.onBack} />
  ) : screen.withEverglow ? (
    <Button title={t("everglow.ok")} variant="secondary" mark="✓" onPress={screen.onBack} />
  ) : screen.isLoading ? null : (
    <>
      {screen.error ? (
        <Text accessibilityRole="alert" className="font-sans text-body text-pencil">
          {screen.error}
        </Text>
      ) : null}
      {screen.kind === "frame" ? (
        <Button
          title={t("decide.removeFrame")}
          variant="danger"
          mark="✕"
          isLoading={screen.pending === "REMOVE_PHOTO"}
          disabled={!!screen.pending}
          onPress={screen.onRemoveFrame}
        />
      ) : null}
      {screen.canRemovePerson ? (
        <Button
          title={screen.removePersonLabel}
          variant={screen.kind === "frame" ? "secondary" : "danger"}
          mark="▸"
          isLoading={screen.pending === "REMOVE_MEMBER"}
          disabled={!!screen.pending}
          onPress={screen.onRemovePerson}
        />
      ) : null}
      <Button
        title={screen.kind === "frame" ? t("decide.keepFrame") : t("decide.keepPerson")}
        variant="ghost"
        isLoading={screen.pending === "DISMISS"}
        disabled={!!screen.pending}
        onPress={screen.onKeep}
      />
    </>
  );

  return (
    <SafeAreaView className="flex-1 bg-ground">
      <TopBar
        title={screen.title}
        left={<BackButton accessibilityLabel={t("common:actions.back")} onPress={screen.onBack} />}
      />
      <ScrollView className="flex-1" contentContainerClassName="px-5 pb-6 pt-4">
        {body}
      </ScrollView>
      {actions ? <View className="gap-2.5 px-5 pb-2 pt-3">{actions}</View> : null}
      <FilmGrain />
    </SafeAreaView>
  );
};

export default ReportCheckScreen;
