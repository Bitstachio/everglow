import { Button } from "@/components/ui/button";
import { Display } from "@/components/ui/display";
import { EdgePrint } from "@/components/ui/edge-print";
import { FilmGrain } from "@/components/ui/film-grain";
import { SafeAreaView } from "@/components/ui/safe-area-view";
import { Spinner } from "@/components/ui/spinner";
import { BackButton, TopBar } from "@/components/ui/top-bar";
import { useTranslation } from "react-i18next";
import { RefreshControl, ScrollView, Text, View } from "react-native";
import { ReportRow } from "../components/report-row";
import { useReportsScreen } from "../hooks/use-reports-screen";

/** 10.8 To check: the reports on a roll, for its hosts. */
const ReportsScreen = () => {
  const { t } = useTranslation(["report", "common"]);
  const screen = useReportsScreen();

  return (
    <SafeAreaView className="flex-1 bg-ground">
      <TopBar
        title={screen.title}
        left={<BackButton accessibilityLabel={t("common:actions.back")} onPress={screen.onBack} />}
      />
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-5 pb-8 pt-4"
        refreshControl={<RefreshControl refreshing={screen.refreshing} onRefresh={screen.onRefresh} />}
      >
        {screen.isLoading ? (
          <Spinner label={t("common:actions.loading")} />
        ) : screen.isError ? (
          <View className="items-start gap-2">
            <Text className="font-sans text-body text-text-2">{t("check.loadFailed")}</Text>
            <Button title={t("check.retry")} variant="ghost" fullWidth={false} className="-ml-2" onPress={screen.onRefresh} />
          </View>
        ) : (
          <>
            <Display dim={t("check.titleDim")}>
              {screen.count ? t("check.title", { count: screen.count }) : t("check.empty")}
            </Display>
            <View className="mt-6">
              {screen.rows.map((row) => (
                <ReportRow
                  key={row.key}
                  title={row.title}
                  edge={row.edge}
                  photo={row.photo}
                  person={row.person}
                  blurred={row.blurred}
                  onPress={row.onPress}
                />
              ))}
            </View>
            {screen.done > 0 ? <EdgePrint className="mt-7">{t("check.done", { count: screen.done })}</EdgePrint> : null}
          </>
        )}
      </ScrollView>
      <FilmGrain />
    </SafeAreaView>
  );
};

export default ReportsScreen;
