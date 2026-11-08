import { useAuth } from "@/context/auth-context";
import { useBlockMutation } from "@/features/moderation/api/mutations";
import { useUnblockMutation } from "@/features/profile/api/mutations";
import { getErrorMessage, isApiError } from "@/lib/api/errors";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useChangeParticipantRoleMutation, useRemoveEventParticipantMutation } from "../api/mutations";
import { useEventBansQuery, useEventParticipantsQuery, useEventQuery } from "../api/queries";
import { firstName, rollRole } from "../lib/roll-page";
import type { AccessLevel, EventParticipantResponseDto, MemberPhotos } from "../types";

/** What opens over the roll call: someone's actions, or a slip about them. */
export type RollCallSheet = "person" | "role" | "remove" | "block" | "lastHost";

/** How long a result stays at the foot of the roll call. */
const NOTICE_MS = 4000;

const isLastHost = (error: unknown) => isApiError(error) && error.code === "LAST_ORGANIZER";

/**
 * 11.1–11.8 The roll call: everyone on the roll. Anyone can report or block
 * someone; hosts can also change roles, remove people and let removed people
 * back in. A held roll (on hold or suspended) only shows who is on it.
 */
export const useRollCallScreen = () => {
  const { t } = useTranslation(["roll", "report"]);
  const router = useRouter();
  const { user } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const eventId = typeof id === "string" ? id : undefined;

  const eventQuery = useEventQuery(eventId);
  const participantsQuery = useEventParticipantsQuery(eventId);
  const event = eventQuery.data ?? null;
  const participants = participantsQuery.data ?? [];
  const role = event ? rollRole(event, participants, user?.id) : "viewer";
  // The API refuses every host change on a suspended roll, and the roll call
  // stays read-only while Everglow reviews one.
  const canManage = role === "host" && event?.status === "ACTIVE";
  const bansQuery = useEventBansQuery(eventId, role === "host" && !!event && event.status !== "SUSPENDED");

  const changeRole = useChangeParticipantRoleMutation(eventId ?? "");
  const removeParticipant = useRemoveEventParticipantMutation(eventId ?? "");
  const blockMutation = useBlockMutation();
  const unblockMutation = useUnblockMutation();

  // One sheet whose content changes, so one modal never opens from another:
  // iOS drops a modal presented while another is closing.
  const [sheet, setSheet] = useState<RollCallSheet | null>(null);
  const [person, setPerson] = useState<EventParticipantResponseDto | null>(null);
  const [slipError, setSlipError] = useState<string | null>(null);
  const afterSheetCloses = useRef<(() => void) | null>(null);

  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (noticeTimer.current && clearTimeout(noticeTimer.current)), []);
  const showNotice = (message: string) => {
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    setNotice(message);
    noticeTimer.current = setTimeout(() => setNotice(null), NOTICE_MS);
  };

  const busy = changeRole.isPending || removeParticipant.isPending || blockMutation.isPending;
  const closeSheet = () => {
    if (busy) return;
    setSheet(null);
    setSlipError(null);
  };
  const openSlip = (next: RollCallSheet) => {
    setSlipError(null);
    setSheet(next);
  };
  const name = person?.name || t("people.unknown");

  const onSaveRole = (accessLevel: AccessLevel) => {
    if (!person || changeRole.isPending) return;
    if (accessLevel === person.accessLevel) {
      setSheet(null);
      return;
    }
    setSlipError(null);
    changeRole.mutate(
      { targetUserId: person.userId, accessLevel },
      {
        onSuccess: () => {
          setSheet(null);
          showNotice(t(`role.done_${accessLevel}`, { name: firstName(name) }));
        },
        onError: (error) =>
          isLastHost(error) ? setSheet("lastHost") : setSlipError(getErrorMessage(error, t("role.failed"))),
      },
    );
  };

  const onConfirmRemove = (photos: MemberPhotos) => {
    if (!person || removeParticipant.isPending) return;
    removeParticipant.mutate(
      { targetUserId: person.userId, photos },
      {
        onSuccess: () => {
          setSheet(null);
          showNotice(t("result.removed", { name }));
        },
        onError: (error) => {
          if (isLastHost(error)) {
            setSheet("lastHost");
            return;
          }
          setSheet(null);
          showNotice(getErrorMessage(error));
        },
      },
    );
  };

  const onConfirmBlock = () => {
    if (!person || blockMutation.isPending) return;
    setSlipError(null);
    blockMutation.mutate(person.userId, {
      onSuccess: () => {
        setSheet(null);
        showNotice(t("report:block.done", { name }));
      },
      onError: (error) => setSlipError(getErrorMessage(error, t("report:block.failed"))),
    });
  };

  const onUnblock = () => {
    if (!person || unblockMutation.isPending) return;
    unblockMutation.mutate(person.userId, {
      onSuccess: () => {
        setSheet(null);
        showNotice(t("report:menu.unblocked", { name }));
      },
      onError: (error) => {
        setSheet(null);
        showNotice(getErrorMessage(error));
      },
    });
  };

  const removed = bansQuery.data?.length ?? 0;
  // The roll stays the way back; a roll call opened on its own still has one.
  const onBack = () =>
    router.canGoBack() ? router.back() : eventId ? router.replace(`/events/${eventId}`) : router.replace("/");

  return {
    event,
    participants,
    role,
    currentUserId: user?.id,
    isLoading: eventQuery.isLoading || participantsQuery.isLoading,
    isError: !eventQuery.isLoading && !participantsQuery.isLoading && (eventQuery.isError || participantsQuery.isError),
    onRetry: () => {
      void eventQuery.refetch();
      void participantsQuery.refetch();
    },
    refreshing: participantsQuery.isRefetching,
    onRefresh: () => {
      void participantsQuery.refetch();
      void eventQuery.refetch();
      if (role === "host") void bansQuery.refetch();
    },
    // The API counts 0 on a closed or suspended roll; that isn't how many they added.
    countsFrames: event?.galleryState !== "CLOSED" && event?.status !== "SUSPENDED",
    // A closed roll takes nobody new, so there's no envelope to send.
    canInvite: canManage && event?.galleryState !== "CLOSED",
    onInvite: () => {
      if (eventId) router.push(`/events/${eventId}/envelope`);
    },
    removed: role === "host" ? removed : 0,
    onOpenRemoved: () => {
      if (eventId) router.push({ pathname: "/events/[id]/removed", params: { id: eventId } });
    },
    onBack,
    notice,

    sheet,
    person,
    busy,
    slipError,
    isChangingRole: changeRole.isPending,
    isRemoving: removeParticipant.isPending,
    isBlocking: blockMutation.isPending,
    onCloseSheet: closeSheet,
    onSheetClosed: () => {
      const next = afterSheetCloses.current;
      afterSheetCloses.current = null;
      next?.();
    },
    onOpenPerson: (participant: EventParticipantResponseDto) => {
      setPerson(participant);
      openSlip("person");
    },
    onBackToPerson: () => {
      if (!busy) openSlip("person");
    },
    canChangeRole: canManage,
    onChangeRole: () => openSlip("role"),
    onSaveRole,
    // Another host can be removed too; the API keeps the last one (11.6).
    canRemove: canManage,
    onRemove: () => openSlip("remove"),
    onConfirmRemove,
    onBlock: () => openSlip("block"),
    onConfirmBlock,
    onUnblock,
    // After the sheet has gone: iOS drops a screen presented over a closing sheet.
    onReport: () => {
      if (!person || !eventId) return;
      const userId = person.userId;
      setSheet(null);
      afterSheetCloses.current = () =>
        router.push({ pathname: "/events/[id]/report", params: { id: eventId, userId } });
    },
    // 11.6: they're already on the roll call, where the new host is chosen.
    onChooseHost: () => setSheet(null),
  };
};
