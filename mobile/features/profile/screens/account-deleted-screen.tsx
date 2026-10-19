import { Button } from "@/components/ui/button";
import { Display } from "@/components/ui/display";
import { FilmGrain } from "@/components/ui/film-grain";
import { SafeAreaView } from "@/components/ui/safe-area-view";
import { Stamp } from "@/components/ui/stamp";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";
import { useAccountDeletedScreen } from "../hooks/use-account-deleted-screen";

/**
 * 14.12 Deleted. The session is already cleared; signing in again with the
 * same Apple or Google account later starts a new, empty account.
 */
const AccountDeletedScreen = () => {
  const { t } = useTranslation("you");
  const { onStart } = useAccountDeletedScreen();

  return (
    <SafeAreaView className="flex-1 bg-ground">
      <View className="flex-1 items-center justify-center gap-4 px-10">
        <Stamp title={t("deleted.stamp")} subtitle={t("deleted.stampSub")} tone="pencil" className="mb-5" />
        <Display className="text-center" dim={t("deleted.titleDim")}>
          {t("deleted.title")}
        </Display>
        <Text className="mt-3 text-center font-sans text-body text-text-2">{t("deleted.body")}</Text>
      </View>
      <View className="px-5 pb-1">
        <Button title={t("deleted.start")} variant="secondary" mark="‹" onPress={onStart} />
      </View>
      <FilmGrain />
    </SafeAreaView>
  );
};

export default AccountDeletedScreen;
