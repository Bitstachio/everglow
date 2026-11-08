import { AppIcon } from "@/components/ui/app-icon";
import { Button } from "@/components/ui/button";
import { Display } from "@/components/ui/display";
import { EdgePrint } from "@/components/ui/edge-print";
import { FilmGrain } from "@/components/ui/film-grain";
import { IconButton } from "@/components/ui/icon-button";
import { IndexRow } from "@/components/ui/index-row";
import { Spinner } from "@/components/ui/spinner";
import { TopBar } from "@/components/ui/top-bar";
import { colorTokens } from "@/theme/tokens";
import { X } from "phosphor-react-native";
import { useTranslation } from "react-i18next";
import { ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CutStrip } from "../components/cut-strip";
import { useCutRollScreen } from "../hooks/use-cut-roll-screen";

/** Cut the roll: what goes and what stays, before a host closes the roll for everyone. */
const CutRollScreen = () => {
  const { t } = useTranslation("common");
  const screen = useCutRollScreen();
  // A native full-screen modal gives the native SafeAreaView no insets, so pad from the provider's.
  const insets = useSafeAreaInsets();

  if (screen.isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-ground">
        <Spinner label={t("actions.loading")} />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-ground" style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}>
      <TopBar
        title={screen.edge}
        left={
          <IconButton accessibilityLabel={screen.closeLabel} onPress={screen.onClose} disabled={screen.isCutting}>
            <AppIcon icon={X} size="sm" color={colorTokens.text} />
          </IconButton>
        }
      />
      <ScrollView className="flex-1" contentContainerClassName="pb-6 pt-3.5">
        <Display className="px-5" dim={screen.titleDim}>
          {screen.title}
        </Display>
        <CutStrip frames={screen.frames} />
        <View className="px-5">
          {screen.rows.map((row) => (
            <IndexRow key={row.key} label={row.label} value={row.value} lit />
          ))}
          <EdgePrint className="mt-3.5">{screen.footnote}</EdgePrint>
        </View>
      </ScrollView>

      <View className="gap-2.5 px-5 pb-2.5 pt-3">
        {screen.error ? (
          <Text accessibilityRole="alert" className="font-sans text-body text-pencil">
            {screen.error}
          </Text>
        ) : null}
        <Button
          title={screen.confirmLabel}
          variant="danger"
          mark="✂"
          onPress={screen.onConfirm}
          isLoading={screen.isCutting}
        />
        <Button
          title={screen.cancelLabel}
          variant="secondary"
          mark="‹"
          onPress={screen.onClose}
          disabled={screen.isCutting}
        />
      </View>
      <FilmGrain />
    </View>
  );
};

export default CutRollScreen;
