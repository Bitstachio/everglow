import { Button } from "@/components/ui/button";
import { Display } from "@/components/ui/display";
import { FilmGrain } from "@/components/ui/film-grain";
import { SafeAreaView } from "@/components/ui/safe-area-view";
import { BackButton, TopBar } from "@/components/ui/top-bar";
import { useTranslation } from "react-i18next";
import { ScrollView, View } from "react-native";
import { TrayRow } from "../components/tray-row";
import { useUploadTrayScreen } from "../hooks/use-upload-tray-screen";
import type { TrayItem } from "../lib/upload-tray";
import { formatSentOf } from "../utils";

/** 08.3 In the tray, and 08.5 Can't be added. */
const UploadTrayScreen = () => {
  const { t } = useTranslation(["roll", "common"]);
  const screen = useUploadTrayScreen();
  const { summary, entries } = screen;

  const [title, dim] =
    summary.rejected > 0 && summary.inFlight > 0
      ? [t("tray.developingRejected", { count: summary.inFlight }), t("tray.rejected", { count: summary.rejected })]
      : summary.inFlight > 0 || summary.developed > 0
        ? [t("tray.title"), t("tray.progress", { developed: summary.developed, total: summary.sendable })]
        : summary.retryable > 0
          ? [t("tray.didntTake", { count: summary.retryable }), t("tray.didntTakeDim")]
          : summary.rejected > 0
            ? [t("tray.rejected", { count: summary.rejected }), undefined]
            : summary.noRoom > 0
              ? [t("room.noneTitle"), undefined]
              : summary.closed > 0
                ? [t("closedSending.title", { count: summary.closed }), t("closedSending.bodyNone")]
                : [t("tray.emptyTitle"), t("tray.emptyDim")];

  const status = (item: TrayItem): string => {
    const { status: s } = item;
    switch (s.kind) {
      case "developed":
        return t("tray.row.uploaded");
      case "sending":
        return `${t("tray.row.uploading")} · ${formatSentOf(s.bytesSent, item.sizeBytes)}`;
      case "waiting":
        return t("tray.row.waiting");
      case "failed":
        return t(
          s.reason === "connection"
            ? "tray.row.offline"
            : s.reason === "missing"
              ? "tray.row.missing"
              : s.reason === "interrupted"
                ? "tray.row.interrupted"
                : s.reason === "noRoom"
                  ? "tray.row.noRoom"
                  : s.reason === "closed"
                    ? "tray.row.closed"
                    : "tray.row.refused",
        );
      case "rejected":
        return t(s.reason === "video" ? "tray.row.video" : "tray.row.tooLarge");
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-ground">
      <TopBar
        title={screen.title}
        left={<BackButton accessibilityLabel={t("common:actions.back")} onPress={screen.onBack} />}
      />
      <ScrollView className="flex-1" contentContainerClassName="pb-8 pt-4">
        <Display className="px-5" dim={dim}>
          {title}
        </Display>

        <View accessibilityLabel={t("tray.rows")} className="mt-6 px-5">
          {entries.map((item) => {
            const text = status(item);
            const rowStatus = item.status;
            const rejected = rowStatus.kind === "rejected";
            const failed = rowStatus.kind === "failed";
            const retryable = failed && ["connection", "refused", "interrupted"].includes(rowStatus.reason);
            return (
              <TrayRow
                key={item.key}
                uri={item.uri}
                status={text}
                accessibilityLabel={`${item.name}, ${text}`}
                done={rowStatus.kind === "developed"}
                actions={
                  failed || rejected
                    ? [
                        ...(retryable
                          ? [
                              {
                                title: t("tray.retry"),
                                accessibilityLabel: t("tray.row.retryLabel", { name: item.name }),
                                onPress: () => screen.onRetryOne(item.key),
                              },
                            ]
                          : []),
                        {
                          title: t("tray.row.remove"),
                          accessibilityLabel: t("tray.row.removeLabel", { name: item.name }),
                          onPress: () => screen.onRemove(item.key),
                        },
                      ]
                    : undefined
                }
              />
            );
          })}
        </View>
      </ScrollView>

      {summary.inFlight > 0 || summary.retryable > 0 ? (
        <View className="flex-row items-center px-3 pb-2">
          {summary.inFlight > 0 ? (
            <Button
              variant="ghost"
              fullWidth={false}
              title={t("tray.cancelRest")}
              className="opacity-70"
              onPress={screen.onCancelRest}
            />
          ) : (
            <Button variant="ghost" fullWidth={false} title={t("tray.retry")} onPress={screen.onRetry} />
          )}
        </View>
      ) : null}
      <FilmGrain />
    </SafeAreaView>
  );
};

export default UploadTrayScreen;
