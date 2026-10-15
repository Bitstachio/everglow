import { useAuth } from "@/context/auth-context";
import { useTranslation } from "react-i18next";
import { Alert } from "react-native";

/**
 * 01.2 Welcome. Start a roll and Sign in both open Auth0 Universal Login; the
 * first lands on its sign-up screen. Cancelling the browser does nothing.
 */
export const useWelcomeScreen = () => {
  const { login, signup, isLoading } = useAuth();
  const { t } = useTranslation(["start", "common"]);

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

  return { isLoading, onStart: run(signup), onSignIn: run(login) };
};
