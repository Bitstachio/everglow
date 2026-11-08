import { Display } from "@/components/ui/display";
import { FilmGrain } from "@/components/ui/film-grain";
import { IndexRow } from "@/components/ui/index-row";
import { SafeAreaView } from "@/components/ui/safe-area-view";
import { Spinner } from "@/components/ui/spinner";
import { BackButton, TopBar } from "@/components/ui/top-bar";
import { useTranslation } from "react-i18next";
import { ScrollView, Text, View } from "react-native";
import { useCantDeleteRollScreen } from "../hooks/use-cant-delete-roll-screen";

/** Why an upcoming or open roll can't be deleted yet, from Delete the roll in its settings. */
const CantDeleteRollScreen = () => {
  const { t } = useTranslation("common");
  const screen = useCantDeleteRollScreen();

  if (screen.isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-ground">
        <Spinner label={t("actions.loading")} />
      </View>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-ground">
      <TopBar
        title={screen.edge}
        left={<BackButton accessibilityLabel={t("actions.back")} onPress={screen.onBack} />}
      />
      <ScrollView className="flex-1" contentContainerClassName="px-5 pb-8 pt-3.5">
        <Display dim={screen.titleDim}>{screen.title}</Display>

        <View className="mt-16.5">
          {screen.rows.map((row) => (
            <IndexRow
              key={row.key}
              label={row.label}
              value={row.value}
              muted={row.muted}
              lit={row.lit}
              onPress={row.onPress}
            />
          ))}
        </View>

        <Text className="mt-21 font-sans text-body text-text-2">{screen.body}</Text>
      </ScrollView>
      <FilmGrain />
    </SafeAreaView>
  );
};

export default CantDeleteRollScreen;
