import { Button } from "@/components/ui/button";
import { Display } from "@/components/ui/display";
import { FilmGrain } from "@/components/ui/film-grain";
import { SafeAreaView } from "@/components/ui/safe-area-view";
import { BackButton, TopBar } from "@/components/ui/top-bar";
import { socialProvider } from "@/lib/auth0-identity";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";
import { useAuth0 } from "react-native-auth0";

const BODY = {
  apple: "password.socialBodyApple",
  google: "password.socialBodyGoogle",
  other: "password.socialBodyOther",
} as const;

/**
 * 14.7 Apple or Google: a social account has no Everglow password to change
 * (the API answers PASSWORD_CHANGE_NOT_AVAILABLE). Email and password
 * accounts never land here; their row opens Auth0's page (14.6).
 */
const PasswordScreen = () => {
  const { t } = useTranslation(["you", "common"]);
  const { user } = useAuth0();
  const provider = socialProvider(user?.sub);
  const close = () => (router.canGoBack() ? router.back() : router.replace("/account-settings"));

  return (
    <SafeAreaView className="flex-1 bg-ground">
      <TopBar
        title={t("password.title")}
        left={<BackButton accessibilityLabel={t("common:actions.back")} onPress={close} />}
      />
      <View className="px-5 pt-10">
        <Display dim={t("password.socialTitleDim", { provider: t(`providers.${provider ?? "other"}`) })}>
          {t("password.socialTitle")}
        </Display>
        <Text className="mt-3 font-sans text-body text-text-2">{t(BODY[provider ?? "other"])}</Text>
      </View>
      <View className="mt-auto px-5 pb-1">
        <Button title={t("password.ok")} variant="secondary" mark="✓" onPress={close} />
      </View>
      <FilmGrain />
    </SafeAreaView>
  );
};

export default PasswordScreen;
