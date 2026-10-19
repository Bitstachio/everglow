import { getErrorMessage } from "@/lib/api/errors";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { Alert } from "react-native";
import { useUnblockMutation } from "../api/mutations";
import { useBlocksQuery } from "../api/queries";
import { initials } from "../lib/initials";

/** 14.8 Blocked people. Unblocking is silent and takes effect at once. */
export const useBlockedPeopleScreen = () => {
  const { t } = useTranslation("you");
  const { data: blocks, isLoading, isError, refetch } = useBlocksQuery();
  const unblock = useUnblockMutation();

  const people = (blocks ?? []).map((block) => ({
    userId: block.userId,
    name: block.name ?? (block.username ? `@${block.username}` : t("blocked.noProfile")),
    handle: block.name && block.username ? `@${block.username}` : undefined,
    initials: initials(block.name ?? block.username ?? ""),
  }));

  return {
    people,
    count: blocks?.length,
    isLoading,
    isError,
    onRetry: () => void refetch(),
    onUnblock: (userId: string) =>
      unblock.mutate(userId, {
        onError: (error) => Alert.alert(t("blocked.failedTitle"), getErrorMessage(error)),
      }),
    onBack: () => (router.canGoBack() ? router.back() : router.replace("/account-settings")),
  };
};
