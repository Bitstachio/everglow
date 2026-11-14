import { initials } from "@/features/profile/lib/initials";
import { getErrorMessage } from "@/lib/api/errors";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Alert } from "react-native";
import { useLiftBanMutation } from "../api/mutations";
import { useEventBansQuery } from "../api/queries";

/**
 * 11.5 The people hosts removed from a roll. Letting someone back in means an
 * envelope works for them again; it doesn't put them back on the roll.
 */
export const useRemovedPeopleScreen = () => {
  const { t } = useTranslation("roll");
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const eventId = typeof id === "string" ? id : undefined;
  const { data: bans, isLoading, isError, refetch } = useEventBansQuery(eventId);
  const liftBan = useLiftBanMutation(eventId ?? "");

  const people = (bans ?? [])
    // A row stays away while its Let back in is on the way.
    .filter((ban) => !(liftBan.isPending && liftBan.variables === ban.userId))
    .map((ban) => {
      const name = ban.name ?? (ban.username ? `@${ban.username}` : t("removedPeople.noProfile"));
      return { userId: ban.userId, name, initials: initials(ban.name ?? ban.username ?? "") };
    });

  return {
    people,
    count: people.length,
    isLoading,
    isError,
    onRetry: () => void refetch(),
    onLetBack: (userId: string) =>
      liftBan.mutate(userId, {
        onError: (error) => Alert.alert(t("removedPeople.failedTitle"), getErrorMessage(error)),
      }),
    onBack: () =>
      router.canGoBack()
        ? router.back()
        : router.replace({ pathname: "/events/[id]/people", params: { id: eventId ?? "" } }),
  };
};
