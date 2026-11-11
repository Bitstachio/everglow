import type { StripFrame } from "@/components/ui/film-strip";
import { useAuth } from "@/context/auth-context";
import { getErrorMessage } from "@/lib/api/errors";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useDeactivateEventMutation } from "../api/mutations";
import { useEventParticipantsQuery, useEventQuery, useRollPreviewQuery } from "../api/queries";
import { rollRole } from "../lib/roll-page";
import { ROLL_FRAMES, toRollPhotos, type RollPhoto } from "../lib/rolls";

/** The latest photos on the left of the cut, dimmed on the right; blank numbered frames when there are fewer. */
const cutFrames = (photos: RollPhoto[], photoCount: number): StripFrame[] => {
  const shown = [...photos].reverse();
  return Array.from({ length: ROLL_FRAMES }, (_, index) => {
    const photo = shown[index];
    const dim = index >= ROLL_FRAMES / 2;
    return photo
      ? { key: photo.cacheKey, ...photo, dim }
      : { key: `blank-${index}`, number: Math.max(photoCount - shown.length, 0) + index + 1, dim };
  });
};

/**
 * Cut the roll: what goes now and what stays, before a host closes it for
 * everyone. Ends in the same deactivate call and refreshes the roll menu's cut
 * always made; the roll then shows it closed just now.
 */
export const useCutRollScreen = () => {
  const { t } = useTranslation("roll");
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const eventId = Array.isArray(id) ? id[0] : id;
  const { user } = useAuth();

  const eventQuery = useEventQuery(eventId);
  const participantsQuery = useEventParticipantsQuery(eventId);
  const deactivate = useDeactivateEventMutation();
  const [error, setError] = useState<string | null>(null);

  const event = eventQuery.data ?? null;
  const participants = participantsQuery.data ?? [];
  const isLoading = eventQuery.isLoading || participantsQuery.isLoading;
  const isHost = event ? rollRole(event, participants, user?.id) === "host" : false;
  // A suspended roll's photos are hidden from everyone, and only an open roll has any.
  const hidden = event?.status === "SUSPENDED";
  const hasPhotos = event !== null && !hidden && event.galleryState === "OPEN";
  const previewQuery = useRollPreviewQuery(eventId ?? "", ROLL_FRAMES, hasPhotos);
  const photos = hasPhotos ? toRollPhotos(previewQuery.data ?? []) : [];
  const photoCount = hasPhotos ? (event?.photoCount ?? 0) : 0;
  const members = event?.usage.members ?? 0;

  // Only a host can cut, and only a roll that hasn't closed. The roll closes
  // once the cut lands, so don't send the host back while it does.
  const cutting = deactivate.isPending || deactivate.isSuccess;
  const cannotCut = event !== null && !cutting && (!isHost || event.galleryState === "CLOSED");
  useEffect(() => {
    if (!isLoading && cannotCut) router.back();
  }, [isLoading, cannotCut, router]);

  useEffect(() => {
    if (!eventQuery.isError || cutting) return;
    router.back();
  }, [eventQuery.isError, cutting, router]);

  const removed =
    photoCount > 0 ? t("cut.removed", { count: photoCount }) : hidden ? t("cut.removedHidden") : t("cut.removedNone");
  const confirmLabel =
    photoCount > 0 ? t("cut.confirm", { count: photoCount }) : hidden ? t("cut.confirmHidden") : t("cut.confirmNone");

  const onConfirm = () => {
    if (!eventId || deactivate.isPending) return;
    setError(null);
    deactivate.mutate(eventId, {
      // Back to the roll, which shows it closed just now.
      onSuccess: () => router.back(),
      onError: (failure) => setError(getErrorMessage(failure, t("cut.failed"))),
    });
  };

  return {
    isLoading: isLoading || !event || !isHost,
    edge: t("cut.edge"),
    title: t("cut.title"),
    titleDim: t("cut.titleDim"),
    frames: cutFrames(photos, photoCount),
    rows: [
      { key: "now", label: t("cut.now"), value: t("cut.nowValue") },
      { key: "atOnce", label: t("cut.atOnce"), value: removed },
      { key: "stays", label: t("cut.stays"), value: t("cut.staysValue", { count: members }) },
    ],
    // Saving is only there while there are photos to save.
    footnote: photoCount > 0 ? t("cut.undoneSave") : t("cut.undone"),
    confirmLabel,
    cancelLabel: t("cut.cancel"),
    closeLabel: t("cut.close"),
    error,
    isCutting: deactivate.isPending,
    onConfirm,
    onClose: () => {
      if (!deactivate.isPending) router.back();
    },
  };
};
