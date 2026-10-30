import { Button } from "@/components/ui/button";
import { Display } from "@/components/ui/display";
import { EdgePrint } from "@/components/ui/edge-print";
import { FilmGrain } from "@/components/ui/film-grain";
import { SafeAreaView } from "@/components/ui/safe-area-view";
import { BackButton, TopBar } from "@/components/ui/top-bar";
import type { ReactNode } from "react";
import { Trans, useTranslation } from "react-i18next";
import { ScrollView, Text, View } from "react-native";
import { TrayRow } from "../components/tray-row";
import { TrayStrip } from "../components/tray-strip";
import { useUploadTrayScreen } from "../hooks/use-upload-tray-screen";
import type { TrayEntry } from "../lib/upload-tray-view";
import { formatSentOf } from "../utils";

/** The tray shows its first few frames on a strip. */
const STRIP_FRAMES = 4;

const underline = <Text className="underline" />;

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

  const status = ({ item, number }: TrayEntry): { text: string; node?: ReactNode } => {
    const { status: s } = item;
    switch (s.kind) {
      case "developed":
        return { text: number !== null ? t("tray.row.developed", { number }) : t("tray.row.uploaded") };
      case "sending":
        return { text: formatSentOf(s.bytesSent, item.sizeBytes) };
      case "waiting":
        return { text: t("tray.row.waiting") };
      case "failed":
        return {
          text: t(
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
          ),
        };
      case "rejected": {
        const key = s.reason === "video" ? "tray.row.video" : "tray.row.tooLarge";
        return {
          text: t(s.reason === "video" ? "tray.row.videoLabel" : "tray.row.tooLargeLabel", { name: item.name }),
          node: <Trans t={t} i18nKey={key} components={{ u: underline }} />,
        };
      }
    }
  };

  const strip = entries
    .filter((entry) => entry.item.status.kind !== "rejected" && entry.item.uri)
    .slice(0, STRIP_FRAMES)
    .map(({ item, develop }) => ({ key: item.key, uri: item.uri, develop }));

  return (
    <SafeAreaView className="flex-1 bg-ground">
      <TopBar title={screen.title} left={<BackButton accessibilityLabel={t("tray.hide")} onPress={screen.onHide} />} />
      <ScrollView className="flex-1" contentContainerClassName="pb-8 pt-4">
        <Display className="px-5" dim={dim}>
          {title}
        </Display>

        {strip.length > 0 ? (
          <View className="mt-6">
            <TrayStrip frames={strip} />
          </View>
        ) : null}

        <View accessibilityLabel={t("tray.rows")} className="mt-6 px-5">
          {entries.map((entry) => {
            const { text, node } = status(entry);
            const rowStatus = entry.item.status;
            const rejected = rowStatus.kind === "rejected";
            const failed = rowStatus.kind === "failed";
            const retryable = failed && ["connection", "refused", "interrupted"].includes(rowStatus.reason);
            return (
              <TrayRow
                key={entry.item.key}
                name={entry.item.name}
                status={node ?? text}
                statusLabel={text}
                done={entry.item.status.kind === "developed"}
                crossed={failed}
                onRemove={rejected ? () => screen.onRemove(entry.item.key) : undefined}
                removeLabel={rejected ? t("tray.row.removeLabel", { name: entry.item.name }) : undefined}
                actions={
                  failed
                    ? [
                        ...(retryable
                          ? [
                              {
                                title: t("tray.retry"),
                                accessibilityLabel: t("tray.row.retryLabel", { name: entry.item.name }),
                                onPress: () => screen.onRetryOne(entry.item.key),
                              },
                            ]
                          : []),
                        {
                          title: t("tray.row.remove"),
                          accessibilityLabel: t("tray.row.removeLabel", { name: entry.item.name }),
                          onPress: () => screen.onRemove(entry.item.key),
                        },
                      ]
                    : undefined
                }
              />
            );
          })}
        </View>
      </ScrollView>

      <View className="flex-row items-center justify-between px-3 pb-2">
        {summary.inFlight > 0 ? (
          <Button
            variant="ghost"
            fullWidth={false}
            title={t("tray.cancelRest")}
            className="opacity-70"
            onPress={screen.onCancelRest}
          />
        ) : summary.retryable > 0 ? (
          <Button variant="ghost" fullWidth={false} title={t("tray.retry")} onPress={screen.onRetry} />
        ) : (
          <EdgePrint> </EdgePrint>
        )}
        <Button variant="ghost" fullWidth={false} title={t("tray.hide")} onPress={screen.onHide} />
      </View>
      <FilmGrain />
    </SafeAreaView>
  );
};

export default UploadTrayScreen;
