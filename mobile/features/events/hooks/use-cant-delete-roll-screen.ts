import { useAuth } from "@/context/auth-context";
import { useEventOpenReportsQuery } from "@/features/moderation/api/queries";
import { groupOpenReports } from "@/features/moderation/lib/report-groups";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useEventParticipantsQuery, useEventQuery } from "../api/queries";
import { formatEnvelopeDay } from "../lib/envelope";
import { rollRole } from "../lib/roll-page";

type BlockerRow = {
  key: string;
  label: string;
  value: string;
  /** The label dims for what only Everglow can settle. */
  muted?: boolean;
  /** The value in full white when the host can act on it. */
  lit: boolean;
  onPress?: () => void;
};

/**
 * Why a roll can't be deleted yet. The API deletes a roll only once it has
 * closed (EVENT_STILL_ACTIVE before then), and not while it is under review
 * (EVENT_UNDER_REVIEW) or has open reports (EVENT_HAS_OPEN_REPORTS), so the
 * host sees each of those that holds, and what to do about it.
 */
export const useCantDeleteRollScreen = () => {
  const { t } = useTranslation("roll");
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const eventId = Array.isArray(id) ? id[0] : id;
  const { user } = useAuth();

  const eventQuery = useEventQuery(eventId);
  const participantsQuery = useEventParticipantsQuery(eventId);
  const event = eventQuery.data ?? null;
  const participants = participantsQuery.data ?? [];
  const isLoading = eventQuery.isLoading || participantsQuery.isLoading;
  const isHost = event ? rollRole(event, participants, user?.id) === "host" : false;
  const reportsQuery = useEventOpenReportsQuery(eventId, isHost && event?.status !== "SUSPENDED");

  // Only hosts delete a roll, and a closed one is deleted from settings instead.
  const leave = event !== null && !isLoading && (!isHost || event.galleryState === "CLOSED");
  useEffect(() => {
    if (leave || eventQuery.isError) router.back();
  }, [leave, eventQuery.isError, router]);

  const openReports = groupOpenReports(reportsQuery.data ?? [], event?.usage.members ?? 0).reduce(
    (count, group) => count + group.reports.length,
    0,
  );

  const rows: BlockerRow[] = [];
  if (event && event.galleryState !== "CLOSED") {
    rows.push({
      key: "open",
      label: event.galleryState === "OPEN" ? t("cantDelete.stillOpen") : t("cantDelete.notOpenYet"),
      value: event.galleryClosesAt
        ? t("cantDelete.waitUntil", { date: formatEnvelopeDay(event.galleryClosesAt) })
        : t("cantDelete.cutFirst"),
      lit: true,
    });
  }
  if (openReports > 0) {
    rows.push({
      key: "reports",
      label: t("cantDelete.reports", { count: openReports }),
      value: t("cantDelete.checkReports"),
      lit: true,
      onPress: () => {
        if (eventId) router.push({ pathname: "/events/[id]/reports", params: { id: eventId } });
      },
    });
  }
  if (event?.status === "UNDER_REVIEW") {
    rows.push({
      key: "review",
      label: t("cantDelete.underReview"),
      value: t("cantDelete.waitForEverglow"),
      muted: true,
      lit: false,
    });
  }

  return {
    isLoading: isLoading || !event || !isHost,
    edge: t("settings.title"),
    title: t("cantDelete.title"),
    titleDim: t("cantDelete.titleDim"),
    rows,
    body: t("cantDelete.body"),
    onBack: () => router.back(),
  };
};
