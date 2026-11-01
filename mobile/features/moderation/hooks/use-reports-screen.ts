import { useEventParticipantsQuery, useEventPhotosQuery, useEventQuery } from "@/features/events/api/queries";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useEventReportsQuery } from "../api/queries";
import { doneThisWeek, frameNumbers, groupOpenReports, type ReportGroup } from "../lib/report-groups";

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/** Where a group of reports is decided (10.9), by what it's about. */
const reportCheckParams = (group: Pick<ReportGroup, "kind" | "photoId" | "userId">) =>
  group.kind === "frame" ? { photoId: group.photoId ?? "" } : { userId: group.userId ?? "" };

/** 10.8 To check: one ticket per frame or person, with its reasons and how many. Reporters are never shown. */
export const useReportsScreen = () => {
  const { t } = useTranslation("report");
  const { id } = useLocalSearchParams<{ id: string }>();
  const eventId = first(id) ?? "";
  const [now] = useState(() => new Date());

  const eventQuery = useEventQuery(eventId);
  const participantsQuery = useEventParticipantsQuery(eventId);
  const photosQuery = useEventPhotosQuery(eventId);
  const reportsQuery = useEventReportsQuery(eventId);

  const memberCount = eventQuery.data?.usage.members ?? participantsQuery.data?.length ?? 0;
  const reports = reportsQuery.data ?? [];
  const groups = groupOpenReports(reports, memberCount);
  const numbers = frameNumbers((photosQuery.data ?? []).map((photo) => photo.id));
  const photos = new Map((photosQuery.data ?? []).map((photo) => [photo.id, photo]));
  const people = new Map((participantsQuery.data ?? []).map((person) => [person.userId, person]));

  const rows = groups.map((group) => {
    const person = group.userId ? people.get(group.userId) : undefined;
    const name = person?.name || t("subject.roll");
    const number = group.photoId ? numbers.get(group.photoId) : undefined;
    const title =
      group.kind === "person"
        ? name
        : number
          ? t("check.frameRow", { number, name: name.split(" ")[0] })
          : t("check.frameRowNoNumber", { name: name.split(" ")[0] });
    const edge = [
      t("check.edge", { count: group.reports.length, reason: t(`reasonShort.${group.reason}`) }),
      group.withEverglow ? t("check.withEverglow") : group.hidden ? t("check.hidden") : null,
    ]
      .filter(Boolean)
      .join(" · ");
    return {
      key: group.key,
      kind: group.kind,
      title,
      edge,
      blurred: group.hidden || group.withEverglow,
      photo: group.photoId ? (photos.get(group.photoId) ?? null) : null,
      person: person ?? null,
      onPress: () =>
        router.push({ pathname: "/events/[id]/report-check", params: { id: eventId, ...reportCheckParams(group) } }),
    };
  });

  return {
    title: rows.length ? t("check.top", { count: rows.length }) : t("check.topNone"),
    rows,
    count: rows.length,
    done: doneThisWeek(reports, now),
    isLoading: reportsQuery.isLoading,
    isError: reportsQuery.isError,
    refreshing: reportsQuery.isRefetching,
    onRefresh: () => void Promise.all([reportsQuery.refetch(), photosQuery.refetch(), participantsQuery.refetch()]),
    onBack: () =>
      router.canGoBack() ? router.back() : router.replace({ pathname: "/events/[id]", params: { id: eventId } }),
  };
};
