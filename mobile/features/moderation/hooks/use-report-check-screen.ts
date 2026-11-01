import { useEventParticipantsQuery, useEventPhotosQuery, useEventQuery } from "@/features/events/api/queries";
import { useAuth } from "@/context/auth-context";
import { getErrorCode, getErrorMessage } from "@/lib/api/errors";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useResolveReportMutation } from "../api/mutations";
import { useEventReportsQuery } from "../api/queries";
import { frameNumbers, groupKey, groupOpenReports } from "../lib/report-groups";
import type { ResolveReportDto } from "../types";

type Params = { id: string; photoId?: string; userId?: string };

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/** Codes that mean the decision is no longer the hosts' to make: go back and let the list catch up. */
const MOVED_ON = new Set(["REPORT_ALREADY_RESOLVED", "REPORTED_PHOTO_GONE", "REPORTED_MEMBER_GONE"]);

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
  const photoId = first(params.photoId);
  const userId = first(params.userId);
  const kind = photoId ? "frame" : "person";
  const [revealed, setRevealed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const resolve = useResolveReportMutation();

  const eventQuery = useEventQuery(eventId);
  const participantsQuery = useEventParticipantsQuery(eventId);
  const photosQuery = useEventPhotosQuery(eventId, kind === "frame");
  const reportsQuery = useEventReportsQuery(eventId);

  const key = groupKey(
    photoId
      ? { targetType: "PHOTO", photoId, reportedUserId: null }
      : { targetType: "MEMBER", photoId: null, reportedUserId: userId ?? null },
  );
  const group =
    groupOpenReports(reportsQuery.data ?? [], eventQuery.data?.usage.members ?? 0).find((item) => item.key === key) ??
    null;
  const photos = photosQuery.data ?? [];
  const photo = photoId ? (photos.find((item) => item.id === photoId) ?? null) : null;
  const number = photoId ? frameNumbers(photos.map((item) => item.id)).get(photoId) : undefined;
  const subjectId = group?.userId ?? userId ?? photo?.addedById ?? null;
  const subject = (participantsQuery.data ?? []).find((person) => person.userId === subjectId) ?? null;
  const name = subject?.name || t("subject.roll");
  const firstName = name.split(" ")[0];
  const count = group?.reports.length ?? 0;
  const withEverglow = group?.withEverglow ?? false;

  const title = withEverglow
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

  const decide = (action: ResolveReportDto["action"]) => {
    const report = group?.actionable;
    if (!report || resolve.isPending) return;
    setError(null);
    resolve.mutate(
      { eventId, reportId: report.id, action },
      {
        onSuccess: onBack,
        onError: (failure) => {
          const code = getErrorCode(failure);
          if (code && MOVED_ON.has(code)) {
            onBack();
            return;
          }
          // REPORT_ESCALATED: it moved to Everglow meanwhile; the refetch turns this into 10.10.
          if (code !== "REPORT_ESCALATED") setError(getErrorMessage(failure, t("decide.failed")));
        },
      },
    );
  };

  // A host can't be removed by another host's report decision, nor can you remove yourself.
  const canRemovePerson = !!subject && subject.accessLevel !== "ORGANIZER" && subject.userId !== user?.id;

  return {
    kind,
    title,
    isLoading: reportsQuery.isLoading || eventQuery.isLoading,
    /** Decided elsewhere, or never there: nothing left to do here. */
    isGone: !reportsQuery.isLoading && !group,
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
    canRemovePerson,
    error,
    pending: resolve.isPending ? resolve.variables?.action : undefined,
    onReveal: () => setRevealed(true),
    onRemoveFrame: () => decide("REMOVE_PHOTO"),
    onRemovePerson: () => decide("REMOVE_MEMBER"),
    onKeep: () => decide("DISMISS"),
    onBack,
  };
};
