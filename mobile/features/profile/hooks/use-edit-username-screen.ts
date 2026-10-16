import { useAuth } from "@/context/auth-context";
import { router } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useEditUsernameForm } from "./use-edit-username-form";

/**
 * 14.3 Username, and 14.4 once both changes in 14 days are used: the API
 * says when it opens again (`usernameChangeAvailableAt`).
 */
export const useEditUsernameScreen = () => {
  const { i18n } = useTranslation();
  const { user, refreshProfile } = useAuth();
  const currentUsername = user?.details?.username ?? "";
  const close = () => (router.canGoBack() ? router.back() : router.replace("/account-settings"));
  const { form, onSubmit, availability } = useEditUsernameForm({
    initialUsername: currentUsername,
    onSuccess: close,
    onLimited: () => {
      // The refreshed profile carries the date; the screen switches to 14.4.
      refreshProfile().catch(() => undefined);
    },
  });

  // Read once: the screen is short-lived, and a date that passes while it is open waits for the next visit.
  const [openedAt] = useState(() => Date.now());
  const availableAt = user?.details?.usernameChangeAvailableAt;
  const opensOn =
    availableAt && new Date(availableAt).getTime() > openedAt
      ? new Intl.DateTimeFormat(i18n.language, { day: "numeric", month: "short" }).format(new Date(availableAt))
      : null;

  return { form, onSubmit, availability, currentUsername, opensOn, onBack: close };
};
