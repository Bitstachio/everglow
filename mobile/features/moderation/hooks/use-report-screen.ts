import { useAuth } from "@/context/auth-context";
import { useEventParticipantsQuery, useEventQuery } from "@/features/events/api/queries";
import { firstName as firstNameOf } from "@/features/events/lib/roll-page";
import { getErrorMessage, isApiError } from "@/lib/api/errors";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useReportMutation } from "../api/mutations";
import { useReportedPhotoQuery } from "../api/queries";
import { goesOnlyToEverglow, lastHostReason, REPORT_NOTE_MAX, REPORT_REASONS, type ReportTarget } from "../lib/reasons";
import type { ReportReason } from "../types";

type Params = { id: string; photoId?: string; userId?: string; number?: string };

/** What the roll shows once a report is sent (10.4): `reported=frame` and so on. */
export type ReportedParam = ReportTarget;

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/**
 * 10.1–10.6 One ticket for a frame (`photoId`), a person (`userId`) or the
 * roll (neither). One reason, ticked; Something else adds a short note. The
 * two serious reasons go only to Everglow, and the ticket says so.
 */
export const useReportScreen = () => {
  const { t } = useTranslation(["report", "roll"]);
  const params = useLocalSearchParams<Params>();
  const eventId = first(params.id) ?? "";
  const photoId = first(params.photoId);
  const userId = first(params.userId);
  const frameNumber = Number(first(params.number));
  const target: ReportTarget = photoId ? "frame" : userId ? "person" : "roll";

  const [reason, setReason] = useState<ReportReason | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const report = useReportMutation();

  const eventQuery = useEventQuery(eventId, !report.isSuccess);
  const participantsQuery = useEventParticipantsQuery(eventId, target !== "roll" && !report.isSuccess);
  const photoQuery = useReportedPhotoQuery(photoId, !report.isSuccess);

  const event = eventQuery.data ?? null;
  const participants = participantsQuery.data ?? [];
  const photo = photoQuery.data ?? null;
  const subjectId = target === "frame" ? photo?.addedById : userId;
  const subject = participants.find((participant) => participant.userId === subjectId) ?? null;
  // Hosts go on seeing a frame they report in their own roll: they're the ones who judge it.
  const { user } = useAuth();
  const isHost = participants.some(
    (participant) => participant.userId === user?.id && participant.accessLevel === "ORGANIZER",
  );
  // Until the roll call loads, or for someone who has left it.
  const name = subject?.name || t("roll:people.unknown");
  const firstName = firstNameOf(name) || name;
  const number = Number.isInteger(frameNumber) && frameNumber > 0 ? frameNumber : null;
  const serious = reason !== null && goesOnlyToEverglow(reason);

  const title =
    target === "frame"
      ? number
        ? t("top.frame", { number })
        : t("top.frameNoNumber")
      : target === "person"
        ? t("top.person", { name })
        : event?.title
          ? t("top.roll", { title: event.title })
          : t("menu.reportRoll");

  const frameLabel = number
    ? subject
      ? t("subject.frame", { number, name: firstName })
      : t("subject.frameNoName", { number })
    : name;
  const subjectLabel = `▸ ${
    target === "frame"
      ? frameLabel
      : target === "person"
        ? subject?.username
          ? t("subject.person", { name: firstName, username: subject.username })
          : firstName
        : t("subject.roll")
  }`;

  // A frame report came from the viewer: going back reopens that frame.
  const onBack = () =>
    photoId
      ? router.dismissTo({ pathname: "/events/[id]", params: { id: eventId, resume: photoId } })
      : router.canGoBack()
        ? router.back()
        : router.replace({ pathname: "/events/[id]", params: { id: eventId } });

  const onSend = () => {
    if (!reason || report.isPending) return;
    setError(null);
    report.mutate(
      {
        eventId,
        target,
        photoId,
        userId,
        reason,
        note: reason === "OTHER" ? note.trim().slice(0, REPORT_NOTE_MAX) || undefined : undefined,
      },
      {
        onSuccess: () => {
          const reported: ReportedParam = target;
          router.dismissTo({ pathname: "/events/[id]", params: { id: eventId, reported } });
        },
        onError: (failure) => {
          // A frame hidden or removed since the menu opened, or a roll that's gone.
          // Someone who has left the roll is a 403 with its own message.
          if (isApiError(failure) && failure.status === 404) {
            setError(t(target === "frame" ? "gone.frame" : "gone.roll"));
            return;
          }
          setError(getErrorMessage(failure, t("failed")));
        },
      },
    );
  };

  return {
    target,
    title,
    eventId,
    event,
    photo,
    subject,
    name,
    firstName,
    subjectLabel,
    reasons: REPORT_REASONS[target].map((value) => ({
      reason: value,
      label: t(`reasons.${target}.${value}` as "reasons.frame.SPAM"),
      checked: value === reason,
    })),
    dividerAfter: lastHostReason(target),
    footer: serious
      ? t("ticket.footer.serious")
      : target === "frame" && isHost
        ? t("ticket.footer.person")
        : t(`ticket.footer.${target}`),
    reason,
    serious,
    note,
    noteMax: REPORT_NOTE_MAX,
    error,
    isSending: report.isPending,
    canSend: reason !== null && !report.isPending,
    onPick: (value: ReportReason) => {
      setError(null);
      setReason(value);
    },
    onChangeNote: setNote,
    onSend,
    onBack,
  };
};
