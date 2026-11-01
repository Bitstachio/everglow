import { AppIcon } from "@/components/ui/app-icon";
import { Button } from "@/components/ui/button";
import { EdgePrint } from "@/components/ui/edge-print";
import { FilmGrain } from "@/components/ui/film-grain";
import { IconButton } from "@/components/ui/icon-button";
import { LabTicket } from "@/components/ui/lab-ticket";
import { TopBar } from "@/components/ui/top-bar";
import { colorTokens } from "@/theme/tokens";
import { X } from "phosphor-react-native";
import { useTranslation } from "react-i18next";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ReportNote } from "../components/report-note";
import { ReportSubject } from "../components/report-subject";
import { useReportScreen } from "../hooks/use-report-screen";

/** 10.1–10.3, 10.5, 10.6 Report a frame, a person or the roll on a lab ticket. */
const ReportScreen = () => {
  const { t } = useTranslation("report");
  const screen = useReportScreen();
  // A native full-screen modal gives the native SafeAreaView no insets, so pad from the provider's.
  const insets = useSafeAreaInsets();
  const { target, photo, subject, event } = screen;

  const subjectPrint =
    target === "person" ? (
      <ReportSubject
        kind="person"
        userId={subject?.userId ?? ""}
        name={subject?.name}
        avatarUrl={subject?.avatarUrl}
        label={screen.subjectLabel}
      />
    ) : target === "frame" ? (
      <ReportSubject kind="frame" circled photoId={photo?.id} uri={photo?.thumbnailUrl} label={screen.subjectLabel} />
    ) : (
      <ReportSubject kind="cover" eventId={screen.eventId} uri={event?.coverUrl} label={screen.subjectLabel} />
    );

  return (
    <View className="flex-1 bg-ground" style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}>
      <TopBar
        title={screen.title}
        left={
          <IconButton accessibilityLabel={t("close")} onPress={screen.onBack}>
            <AppIcon icon={X} size="sm" color={colorTokens.text} />
          </IconButton>
        }
      />
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView className="flex-1" contentContainerClassName="gap-5 px-5 pb-6 pt-4" keyboardShouldPersistTaps="handled">
          {subjectPrint}
          <View testID="report-ticket" className="px-1">
            <LabTicket
              title={
                target === "person" ? t("ticket.person", { name: screen.firstName }) : t(`ticket.${target}`)
              }
              number={t("ticket.anonymous")}
              options={screen.reasons.map((option) => ({
                key: option.reason,
                label: option.label,
                checked: option.checked,
                onPress: () => screen.onPick(option.reason),
              }))}
              divider={screen.dividerAfter ? { afterKey: screen.dividerAfter, label: t("ticket.everglow") } : undefined}
              writeIn={
                screen.reason === "OTHER"
                  ? {
                      afterKey: "OTHER",
                      content: (
                        <ReportNote
                          value={screen.note}
                          onChangeText={screen.onChangeNote}
                          placeholder={t("ticket.notePlaceholder")}
                          accessibilityLabel={t("ticket.noteLabel")}
                          maxLength={screen.noteMax}
                        />
                      ),
                    }
                  : undefined
              }
              footer={screen.serious ? t("ticket.footer.serious") : t(`ticket.footer.${target}`)}
            />
          </View>
        </ScrollView>
        <View className="gap-2 px-5 pb-2 pt-3">
          {screen.error ? (
            <EdgePrint accessibilityLiveRegion="polite" accessibilityRole="alert" tone="text" className="text-center">
              {screen.error}
            </EdgePrint>
          ) : null}
          <Button
            title={screen.serious ? t("sendEverglow") : t("send")}
            mark="▸"
            disabled={!screen.canSend}
            isLoading={screen.isSending}
            onPress={screen.onSend}
          />
        </View>
      </KeyboardAvoidingView>
      <FilmGrain />
    </View>
  );
};

export default ReportScreen;
