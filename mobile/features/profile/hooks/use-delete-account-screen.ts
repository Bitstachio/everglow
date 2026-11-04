import { useAuth } from "@/context/auth-context";
import { getErrorCode, isApiError } from "@/lib/api/errors";
import { messageForApiErrorCode } from "@/lib/api/error-messages";
import { router } from "expo-router";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert } from "react-native";
import { useDeleteProfileMutation } from "../api/mutations";
import { useDeletionPreviewQuery } from "../api/queries";
import type { AccountDeletionEventOutcome, DeleteAccountPhotoPolicy } from "../types";

export type RollFate = AccountDeletionEventOutcome;

/**
 * 14.11 Delete account. The photos choice is required by the API and has no
 * default here: both outcomes are permanent, so the person picks one.
 *
 * What happens to each roll comes from the API, which runs the deletion's own
 * preparation and rolls it back (docs/account-deletion.md §6a): a roll you
 * host alone goes to its longest-standing member, one with no one else on it
 * is deleted, unless it is under review or has open reports, in which case it
 * is kept for Everglow. The answer can depend on the photos choice, so it is
 * asked again when that changes; before a choice it shows what Leave them
 * would do. A suspended account may ask too, since it may delete itself.
 */
export const useDeleteAccountScreen = () => {
  const { t } = useTranslation("you");
  const { identity, isSuspended, logout } = useAuth();
  const [photos, setPhotos] = useState<DeleteAccountPhotoPolicy | null>(null);
  const preview = useDeletionPreviewQuery(photos ?? "KEEP");
  const deleteProfile = useDeleteProfileMutation();
  // Stays set through the sign-out that follows, so the leader can't be
  // pressed again while Auth0 clears the session.
  const [isDeleting, setIsDeleting] = useState(false);
  const deleting = useRef(false);

  const rolls = (preview.data?.events ?? []).map((event) => ({
    id: event.eventId,
    title: event.title,
    fate: event.outcome,
  }));

  const onDelete = async () => {
    if (!photos || deleting.current) return;
    deleting.current = true;
    setIsDeleting(true);
    try {
      await deleteProfile.mutateAsync(photos);
    } catch (error) {
      const code = getErrorCode(error);
      // The background job is finishing it; the auth context has already
      // cleared this phone and says so on the welcome.
      if (code === "ACCOUNT_DELETION_IN_PROGRESS") return;
      deleting.current = false;
      setIsDeleting(false);
      if (code === "ACCOUNT_DELETION_UNAVAILABLE") {
        // Checked before anything was touched: the account is as it was.
        Alert.alert(t("delete.unavailableTitle"), messageForApiErrorCode(code));
        return;
      }
      // A request that never reached the API changed nothing; anything else
      // may have started the deletion, which Delete my account resumes.
      const started = isApiError(error) && error.status != null;
      Alert.alert(t("delete.failedTitle"), started ? t("delete.failedBody") : undefined);
      return;
    }
    // Apple keeps Everglow listed under the Apple ID when the token couldn't
    // be revoked; the last screen says where to remove it.
    await logout(identity?.sub.startsWith("apple|") ? "/account-deleted?apple=1" : "/account-deleted");
  };

  return {
    photos,
    rolls,
    /** The rolls section, unless there's nothing in it to talk about. */
    showRolls: preview.isError || rolls.length > 0,
    rollsFailed: preview.isError,
    isDeleting,
    onChoosePhotos: setPhotos,
    onRetryRolls: () => void preview.refetch(),
    onDelete: () => void onDelete(),
    onBack: () =>
      router.canGoBack() ? router.back() : router.replace(isSuspended ? "/account-suspended" : "/account-settings"),
  };
};
