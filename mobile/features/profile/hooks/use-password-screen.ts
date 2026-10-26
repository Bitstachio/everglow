import { socialProvider, type SocialProvider } from "@/lib/auth0-identity";
import { router } from "expo-router";
import { useAuth0 } from "react-native-auth0";

/**
 * 14.7 Apple or Google: which provider the account signs in with, so the
 * screen can say where its password lives.
 */
export const usePasswordScreen = () => {
  const { user } = useAuth0();
  const provider: SocialProvider | "other" = socialProvider(user?.sub) ?? "other";
  const close = () => (router.canGoBack() ? router.back() : router.replace("/account-settings"));

  return { provider, onClose: close };
};
