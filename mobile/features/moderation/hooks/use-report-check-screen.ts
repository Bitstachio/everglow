import { useEventParticipantsQuery, useEventPhotosQuery, useEventQuery } from "@/features/events/api/queries";
import { useAuth } from "@/context/auth-context";
import { getErrorCode, getErrorMessage } from "@/lib/api/errors";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useResolveReportMutation } from "../api/mutations";
import { useEventOpenReportsQuery } from "../api/queries";
import { frameNumbers, groupOpenReports } from "../lib/report-groups";
import type { MemberPhotos, ResolveReportDto } from "../types";

/** `key` is the group's key from 10.8 (`frame:…`, `person:…` or `report:…`). */
type Params = { id: string; key: string };

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/**
 * 10.9 Decide on a frame or a person: remove the frame, remove the person,
 * or keep it, which shows a hidden frame again. One decision closes every
 * report on it. 10.10 when it's with Everglow: hosts are told no more than that.
 */
export const useReportCheckScreen = () => {
  const { t, i18n } = useTranslation("report");
  const { user } = useAuth();
  const params = useLocalSearchParams<Params>();
  const eventId = first(params.id) ?? "";
  const key = first(params.key) ?? "";
  const [revealed, setRevealed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** A removal waits for its confirm: the frame (09.10's slip) or the person (11.4's). */
  const [confirming, setConfirming] = useState<"frame" | "person" | null>(null);
  const resolve = useResolveReportMutation();

  const eventQuery = useEventQuery(eventId);
  const participantsQuery = useEventParticipantsQuery(eventId);
  const reportsQuery = useEventOpenReportsQuery(eventId);

  const group =
    groupOpenReports(reportsQuery.data ?? [], eventQuery.data?.usage.members ?? 0).find((item) => item.key === key) ??
    null;
  const kind = group?.kind ?? (key.startsWith("person:") ? "person" : "frame");
  const photoId = group?.photoId ?? null;
  const photosQuery = useEventPhotosQuery(eventId, kind === "frame");
  const photos = photosQuery.data ?? [];
  const photo = photoId ? (photos.find((item) => item.id === photoId) ?? null) : null;
  const number = photoId ? frameNumbers(photos.map((item) => item.id)).get(photoId) : undefined;
  const subject = (participantsQuery.data ?? []).find((person) => person.userId === group?.userId) ?? null;
  // Someone who left the roll, or deleted their account, is no longer in the roll call.
  const name = subject?.name || t("check.left");
  const firstName = name.split(" ")[0];
  const count = group?.reports.length ?? 0;
  const withEverglow = group?.withEverglow ?? false;

  const isLoading =
    reportsQuery.isLoading ||
    eventQuery.isLoading ||
    participantsQuery.isLoading ||
    (kind === "frame" && photosQuery.isLoading);
  // A list that loaded once stays on screen through a failed refresh.
  const loadError = reportsQuery.isError && !reportsQuery.data ? getErrorMessage(reportsQuery.error) : null;
  const isGone = !isLoading && !loadError && !group;

  const title =
    !group || isLoading
      ? t("check.topNone")
      : withEverglow
        ? kind === "frame"
          ? number
            ? t("everglow.topFrame", { number })
            : t("everglow.topFrameNoNumber")
          : t("everglow.topPerson", { name })
        : kind === "frame"
          ? number
            ? t("decide.topFrame", { number, count })
            : t("decide.topFrameNoNumber", { count })
          : t("decide.topPerson", { name, count });

  const addedAt = photo
    ? new Date(photo.createdAt).toLocaleString(i18n.language, {
        weekday: "short",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      })
    : null;

  const onBack = () =>
    router.canGoBack() ? router.back() : router.replace({ pathname: "/events/[id]/reports", params: { id: eventId } });

  const decide = async (action: ResolveReportDto["action"], photos?: MemberPhotos) => {
    const candidates = group?.decidable ?? [];
    if (!candidates.length || resolve.isPending) return;
    setError(null);
    let failure: unknown;
    // A host can't decide on a report they filed themselves, but another
    // report on the same frame or person closes theirs with it.
    for (const report of candidates) {
      try {
        await resolve.mutateAsync({ eventId, reportId: report.id, action, ...(photos ? { photos } : {}) });
        onBack();
        return;
      } catch (caught) {
        failure = caught;
        if (getErrorCode(caught) !== "CANNOT_RESOLVE_OWN_REPORT") break;
      }
    }
    const code = getErrorCode(failure);
    // Another host decided first: the list has caught up, so go back to it.
    if (code === "REPORT_ALREADY_RESOLVED") {
      onBack();
      return;
    }
    // REPORT_ESCALATED: it moved to Everglow meanwhile; the refetch turns this into 10.10.
    if (code !== "REPORT_ESCALATED") setError(getErrorMessage(failure, t("decide.failed")));
  };

  // A host can't be removed by another host's report decision, nor can you remove yourself.
  const canRemovePerson = !!subject && subject.accessLevel !== "ORGANIZER" && subject.userId !== user?.id;

  return {
    kind,
    title,
    isLoading,
    loadError,
    /** Decided elsewhere, or never there: nothing left to do here. */
    isGone,
    withEverglow,
    photo,
    subject,
    revealed,
    reasonValue: group
      ? t("decide.reasonValue", { reason: t(`reasonLong.${group.reason}`), count: group.reasonCount })
      : "",
    addedByValue: addedAt ? t("decide.addedByValue", { name, time: addedAt }) : name,
    notes: (group?.reports ?? []).map((report) => report.note).filter((note): note is string => !!note),
    removePersonLabel: t("decide.removePerson", { name: firstName }),
    /** Only a frame still on the roll can be removed. */
    canRemoveFrame: !!photo,
    canRemovePerson,
    error,
    pending: resolve.isPending ? resolve.variables?.action : undefined,
    confirming,
    onReveal: () => setRevealed(true),
    onRemoveFrame: () => setConfirming("frame"),
    onRemovePerson: () => setConfirming("person"),
    onCancelConfirm: () => setConfirming(null),
    // The slip closes first; the leader on the screen shows the decision going through.
    onConfirmRemoveFrame: () => {
      setConfirming(null);
      void decide("REMOVE_PHOTO");
    },
    onConfirmRemovePerson: (photos: MemberPhotos) => {
      setConfirming(null);
      void decide("REMOVE_MEMBER", photos);
    },
    onKeep: () => void decide("DISMISS"),
    onRetry: () => void reportsQuery.refetch(),
    onBack,
  };
};
