import { useEventParticipantsQuery, useEventPhotosQuery, useEventQuery } from "@/features/events/api/queries";
import { getErrorMessage } from "@/lib/api/errors";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useEventOpenReportsQuery, useEventRecentReportsQuery } from "../api/queries";
import { doneThisWeek, frameNumbers, groupOpenReports, toCheckCount } from "../lib/report-groups";

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/** 10.8 To check: one ticket per frame or person, with its reasons and how many. Reporters are never shown. */
export const useReportsScreen = () => {
  const { t } = useTranslation("report");
  const { id } = useLocalSearchParams<{ id: string }>();
  const eventId = first(id) ?? "";
  const [now] = useState(() => new Date());

  const eventQuery = useEventQuery(eventId);
  const participantsQuery = useEventParticipantsQuery(eventId);
  const photosQuery = useEventPhotosQuery(eventId);
  const reportsQuery = useEventOpenReportsQuery(eventId);
  const recentQuery = useEventRecentReportsQuery(eventId);

  const memberCount = eventQuery.data?.usage.members ?? participantsQuery.data?.length ?? 0;
  const groups = groupOpenReports(reportsQuery.data ?? [], memberCount);
  const toCheck = toCheckCount(groups);
  const numbers = frameNumbers((photosQuery.data ?? []).map((photo) => photo.id));
  const photos = new Map((photosQuery.data ?? []).map((photo) => [photo.id, photo]));
  const people = new Map((participantsQuery.data ?? []).map((person) => [person.userId, person]));

  const rows = groups.map((group) => {
    const person = group.userId ? people.get(group.userId) : undefined;
    const number = group.photoId ? numbers.get(group.photoId) : undefined;
    // Someone who left the roll, or deleted their account, is no longer in the roll call.
    const byName = person?.name.split(" ")[0] || t("check.leftInline");
    const title =
      group.kind === "person"
        ? person?.name || t("check.left")
        : number
          ? t("check.frameRow", { number, name: byName })
          : t("check.frameRowNoNumber", { name: byName });
    const edge = [
      t("check.edge", { count: group.reports.length, reason: t(`reasonShort.${group.reason}`) }),
      group.automated ? t("check.automated") : null,
      group.withEverglow ? t("check.withEverglow") : group.hidden ? t("check.hidden") : null,
    ]
      .filter(Boolean)
      .join(" · ");
    return {
      key: group.key,
      title,
      edge,
      blurred: group.hidden || group.withEverglow,
      photo: group.photoId ? (photos.get(group.photoId) ?? null) : null,
      person: person ?? null,
      onPress: () => router.push({ pathname: "/events/[id]/report-check", params: { id: eventId, key: group.key } }),
    };
  });

  return {
    title: toCheck ? t("check.top", { count: toCheck }) : t("check.topNone"),
    rows,
    /** What hosts can still decide; rows with Everglow are listed but not counted. */
    toCheck,
    done: doneThisWeek(recentQuery.data ?? [], now),
    // Names and frame numbers come with the roll call and the frames, so wait for them too.
    isLoading: reportsQuery.isLoading || participantsQuery.isLoading || photosQuery.isLoading,
    // A list that loaded once stays on screen through a failed refresh.
    loadError: reportsQuery.isError && !reportsQuery.data ? getErrorMessage(reportsQuery.error) : null,
    refreshing: reportsQuery.isRefetching,
    onRefresh: () =>
      void Promise.all([
        reportsQuery.refetch(),
        recentQuery.refetch(),
        photosQuery.refetch(),
        participantsQuery.refetch(),
      ]),
    onBack: () =>
      router.canGoBack() ? router.back() : router.replace({ pathname: "/events/[id]", params: { id: eventId } }),
  };
};
