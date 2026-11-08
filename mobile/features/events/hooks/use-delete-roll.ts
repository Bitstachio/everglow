import { getErrorMessage } from "@/lib/api/errors";
import { useRouter } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useDeleteEventMutation } from "../api/mutations";
import { closedOn } from "../lib/envelope";
import { formatClosedOn } from "../lib/rolls";
import type { EventResponseDto } from "../types";

type DeleteRollOptions = {
  /** The roll is gone: put the slip away. Home follows once it has (`leaveIfDeleted`). */
  onDeleted: () => void;
};

/**
 * Delete a closed roll from its slip, wherever the slip is shown: roll
 * settings, or the roll's menu. A roll can be deleted only once it has closed
 * (EVENT_STILL_ACTIVE before then); refusals such as EVENT_HAS_OPEN_REPORTS
 * and EVENT_UNDER_REVIEW stay in the slip. Once deleted, the app goes Home
 * without refetching the roll.
 */
export const useDeleteRoll = (event: EventResponseDto | null, { onDeleted }: DeleteRollOptions) => {
  const { t } = useTranslation("roll");
  const router = useRouter();
  const mutation = useDeleteEventMutation();
  // Once the roll is deleted its queries fail on the way out; that's not a load error.
  const deleted = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const isDeleted = useCallback(() => deleted.current, []);

  const onConfirm = () => {
    if (!event || mutation.isPending) return;
    setError(null);
    deleted.current = true;
    mutation.mutate(event.id, {
      onSuccess: onDeleted,
      onError: (failure) => {
        deleted.current = false;
        setError(getErrorMessage(failure, t("settings.deleteRoll.failed")));
      },
    });
  };

  return {
    /** Before the slip opens: a refusal from last time doesn't carry over. */
    reset: () => setError(null),
    /** Whether the roll has been deleted, so its queries failing is expected. */
    isDeleted,
    /** Once the slip has gone: Home, past the roll underneath, which would only fail to load now. */
    leaveIfDeleted: () => {
      if (!deleted.current) return;
      router.dismissAll();
      router.replace("/events");
    },
    isDeleting: mutation.isPending,
    slip: {
      edge: event
        ? t("settings.deleteRoll.edge", { date: formatClosedOn(closedOn(event)), count: event.usage.members })
        : "",
      body: t("settings.deleteRoll.body", { count: event?.usage.members ?? 0 }),
      confirmLabel: t("settings.deleteRoll.confirm", { title: event?.title ?? "" }),
      error,
      isDeleting: mutation.isPending,
      onConfirm,
    },
  };
};
