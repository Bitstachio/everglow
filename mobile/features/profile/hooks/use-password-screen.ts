import { useAuth } from "@/context/auth-context";
import { socialProvider, type SocialProvider } from "@/lib/auth0-identity";
import { router } from "expo-router";

/**
 * 14.7 Apple or Google: which provider the account signs in with, so the
 * screen can say where its password lives.
 */
export const usePasswordScreen = () => {
  const { identity } = useAuth();
  const provider: SocialProvider | "other" = socialProvider(identity?.sub) ?? "other";
  const close = () => (router.canGoBack() ? router.back() : router.replace("/account-settings"));

  return { provider, onClose: close };
};
