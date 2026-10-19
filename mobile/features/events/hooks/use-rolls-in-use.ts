import { useAuth } from "@/context/auth-context";
import { useTranslation } from "react-i18next";
import { useEventsQuery } from "../api/queries";
import { formatLongDay } from "../lib/new-roll";
import { formatClosesOn, groupRolls } from "../lib/rolls";
import type { Event, UserLimitsResponseDto } from "../types";

/**
 * 04.8 When the account already runs as many rolls as its plan allows: how
 * many, which roll frees a spot first and when. Every number comes from
 * `GET /users/me/limits`; null while there is still room.
 *
 * `hitLimit` is set when a create was refused with `ACTIVE_EVENT_LIMIT_REACHED`,
 * in case the limits were read before another roll was loaded elsewhere.
 */
export const useRollsInUse = (limits: UserLimitsResponseDto | undefined, hitLimit: boolean) => {
  const { t } = useTranslation("create");
  const { user } = useAuth();
  const { data: events = [] } = useEventsQuery(user?.id);

  const limit = limits?.limits.activeEvents ?? null;
  if (!limits || limit === null) return null;
  const used = limits.usage.activeEvents;
  if (used < limit && !hitLimit) return null;

  // The rolls you started that still count, the one that frees a spot last, under its note.
  const next = limits.nextClosingEvent;
  const { live, upcoming } = groupRolls(events.filter((event) => event.creatorId === user?.id));
  const running = [...live, ...upcoming];
  const rolls: Event[] = next
    ? [...running.filter((event) => event.id !== next.id), ...running.filter((event) => event.id === next.id)]
    : running;

  return {
    edge: t("full.edge", { plan: t(`full.plans.${limits.plan}`), used, limit }),
    title: limit === 2 ? t("full.titleBoth") : t("full.title", { count: limit }),
    dim: t("full.dim", { count: limit }),
    runs: t(`full.runs.${limits.plan}`, { count: limit }),
    next: next ? { title: next.title, date: formatLongDay(new Date(next.galleryClosesAt)) } : null,
    rolls: rolls.map((event) => ({
      event,
      note: next && event.id === next.id ? t("full.note", { date: formatClosesOn(next.galleryClosesAt) }) : undefined,
    })),
  };
};
