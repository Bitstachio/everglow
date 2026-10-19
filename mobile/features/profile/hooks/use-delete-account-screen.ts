import { useAuth } from "@/context/auth-context";
import { useEventsQuery } from "@/features/events/api/queries";
import { getErrorMessage } from "@/lib/api/errors";
import { router } from "expo-router";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert } from "react-native";
import { useDeleteProfileMutation } from "../api/mutations";
import type { DeleteAccountPhotoPolicy } from "../types";

export type RollFate = "stays" | "deleted";

/**
 * 14.11 Delete account. The photos choice is required by the API and has no
 * default here: both outcomes are permanent, so the person picks one.
 *
 * What happens to each roll follows docs/account-deletion.md: a roll with no
 * one else on it is deleted; any other stays, handed to the longest-standing
 * member when you host it alone. The events list says who started a roll and
 * how many are on it, not who else hosts it, so the rows say "stays" rather
 * than naming who it goes to. A suspended account can't list its rolls (the
 * API refuses), so it gets the rule without the list.
 */
export const useDeleteAccountScreen = () => {
  const { t } = useTranslation("you");
  const { user, isSuspended, logout } = useAuth();
  const events = useEventsQuery(isSuspended ? undefined : user?.id);
  const [photos, setPhotos] = useState<DeleteAccountPhotoPolicy | null>(null);
  const deleteProfile = useDeleteProfileMutation();
  // Stays set through the sign-out that follows, so the leader can't be
  // pressed again while Auth0 clears the session.
  const [isDeleting, setIsDeleting] = useState(false);
  const deleting = useRef(false);

  const rolls = (events.data ?? [])
    .filter((event) => event.usage.members <= 1 || event.creatorId === user?.id)
    .map((event) => ({
      id: event.id,
      title: event.title,
      fate: (event.usage.members <= 1 ? "deleted" : "stays") as RollFate,
    }));

  const onDelete = async () => {
    if (!photos || deleting.current) return;
    deleting.current = true;
    setIsDeleting(true);
    try {
      await deleteProfile.mutateAsync(photos);
    } catch (error) {
      deleting.current = false;
      setIsDeleting(false);
      Alert.alert(t("delete.failedTitle"), getErrorMessage(error));
      return;
    }
    await logout("/account-deleted");
  };

  return {
    photos,
    rolls,
    /** The rolls section, unless there's nothing in it to talk about. */
    showRolls: isSuspended || events.isError || rolls.length > 0,
    rollsFailed: events.isError,
    isDeleting,
    onChoosePhotos: setPhotos,
    onRetryRolls: () => void events.refetch(),
    onDelete: () => void onDelete(),
    onBack: () =>
      router.canGoBack() ? router.back() : router.replace(isSuspended ? "/account-suspended" : "/account-settings"),
  };
};
