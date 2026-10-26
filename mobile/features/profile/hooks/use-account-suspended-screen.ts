import { useAuth } from "@/context/auth-context";
import { router } from "expo-router";
import { useLabCard } from "./use-lab-card";

/** 14.13 Suspended account: the lab card, and the two ways out. */
export const useAccountSuspendedScreen = () => {
  const { logout, isLoading } = useAuth();
  const { card } = useLabCard();

  return {
    card,
    isSigningOut: isLoading,
    onSignOut: () => void logout(),
    onDeleteAccount: () => router.push("/delete-account"),
  };
};
