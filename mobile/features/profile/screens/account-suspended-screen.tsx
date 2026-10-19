import { Button } from "@/components/ui/button";
import { Display, Wordmark } from "@/components/ui/display";
import { EdgePrint } from "@/components/ui/edge-print";
import { FilmGrain } from "@/components/ui/film-grain";
import { LabCard } from "@/components/ui/lab-card";
import { SafeAreaView } from "@/components/ui/safe-area-view";
import { TopBar } from "@/components/ui/top-bar";
import { useTranslation } from "react-i18next";
import { ScrollView, Text, View } from "react-native";
import { useAccountSuspendedScreen } from "../hooks/use-account-suspended-screen";

/**
 * 14.13 Suspended account (ACCOUNT_SUSPENDED): everything is refused except
 * reading the account and deleting it. It doesn't say why, so nothing affects
 * an investigation.
 */
const AccountSuspendedScreen = () => {
  const { t } = useTranslation("you");
  const { card, isSigningOut, onSignOut, onDeleteAccount } = useAccountSuspendedScreen();

  return (
    <SafeAreaView className="flex-1 bg-ground">
      <TopBar left={<Wordmark />} />
      <ScrollView className="flex-1" contentContainerClassName="px-5 pb-6 pt-4">
        <View className="px-0.5">
          <LabCard {...card} />
        </View>
        <View className="mt-11.5 border-t-2 border-pencil pt-3">
          <EdgePrint tone="pencil">{t("suspended.edge")}</EdgePrint>
          <Display variant="slip" className="mt-2.5" dim={t("suspended.titleDim")}>
            {t("suspended.title")}
          </Display>
          <Text className="mt-3 font-sans text-body text-text-2">{t("suspended.body")}</Text>
        </View>
      </ScrollView>
      <View className="gap-2.5 px-5 pb-1">
        <Button
          title={t("suspended.signOut")}
          variant="secondary"
          mark="⇥"
          onPress={onSignOut}
          isLoading={isSigningOut}
        />
        <Button
          title={t("suspended.delete")}
          variant="ghost"
          className={isSigningOut ? undefined : "opacity-80"}
          onPress={onDeleteAccount}
          disabled={isSigningOut}
        />
      </View>
      <FilmGrain />
    </SafeAreaView>
  );
};

export default AccountSuspendedScreen;
