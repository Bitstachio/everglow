import { useAuth } from "@/context/auth-context";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert } from "react-native";

/**
 * 01.2 Welcome. Start a roll and Sign in both open Auth0 Universal Login; the
 * first lands on its sign-up screen. Cancelling the browser does nothing.
 * After a 401 the route carries `signedOut=1` and the welcome opens with the
 * signed-out slip (01.8).
 */
export const useWelcomeScreen = () => {
  const { login, signup, isLoading } = useAuth();
  const { t } = useTranslation(["start", "common"]);
  const { signedOut } = useLocalSearchParams<{ signedOut?: string }>();
  const [slipDismissed, setSlipDismissed] = useState(false);

  const run = (action: () => Promise<void>) => async () => {
    try {
      await action();
    } catch (err) {
      Alert.alert(
        t("start:welcome.failedTitle"),
        err instanceof Error && err.message ? err.message : t("common:actions.tryAgain"),
      );
    }
  };

  const onSignIn = run(login);

  return {
    isLoading,
    onStart: run(signup),
    onSignIn,
    showSignedOut: signedOut === "1" && !slipDismissed,
    onDismissSignedOut: () => setSlipDismissed(true),
    onSignInAgain: () => {
      setSlipDismissed(true);
      void onSignIn();
    },
  };
};
