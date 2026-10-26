import { useAuth } from "@/context/auth-context";
import { router } from "expo-router";
import { useState } from "react";
import { useAuth0 } from "react-native-auth0";
import { useBlocksQuery } from "../api/queries";
import { useChangePassword } from "./use-change-password";
import { useLabCard } from "./use-lab-card";

/** 14.1 You: the lab card, and the index of everything else on the account. */
export const useProfileScreen = () => {
  const { user, logout, isLoading } = useAuth();
  const { user: auth0User } = useAuth0();
  const { card } = useLabCard();
  const { canChangePassword, isChangingPassword, handleChangePassword } = useChangePassword();
  const [signOutVisible, setSignOutVisible] = useState(false);
  const { data: blocks } = useBlocksQuery();

  const details = user?.details;

  return {
    user,
    card,
    username: details ? `@${details.username}` : undefined,
    email: auth0User?.email ?? undefined,
    blockedCount: blocks?.length,
    isLoading,
    isChangingPassword,
    signOutVisible,
    onBack: () => (router.canGoBack() ? router.back() : router.replace("/events")),
    onEditCard: () => router.push("/edit-card"),
    onOpenUsername: () => router.push("/edit-username"),
    // Email and password accounts go straight to Auth0's page (14.6); Apple
    // and Google accounts have no Everglow password (14.7).
    onOpenPassword: canChangePassword ? handleChangePassword : () => router.push("/password"),
    onOpenBlocked: () => router.push("/blocked-people"),
    onOpenTerms: () => router.push("/terms-of-use"),
    onOpenPrivacy: () => router.push("/privacy-policy"),
    onSignOut: () => setSignOutVisible(true),
    onCloseSignOut: () => setSignOutVisible(false),
    onConfirmSignOut: () => {
      setSignOutVisible(false);
      void logout();
    },
    onDeleteAccount: () => router.push("/delete-account"),
  };
};
