import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

/** How long the note stays on the roll. */
export const ARRIVAL_NOTE_MS = 4000;

/**
 * The note a roll shows when an envelope opened it (06.6, 06.7), read from
 * the route: `arrival=joined&place=25` or `arrival=already`. It goes after a
 * few seconds and takes the params with it, so coming back doesn't repeat it.
 */
export const useArrivalNote = (): string | null => {
  const { t } = useTranslation("join");
  const { arrival, place } = useLocalSearchParams<{ arrival?: string; place?: string }>();
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!arrival) return;
    const timer = setTimeout(() => {
      setDismissed(true);
      router.setParams({ arrival: undefined, place: undefined });
    }, ARRIVAL_NOTE_MS);
    return () => clearTimeout(timer);
  }, [arrival]);

  if (dismissed) return null;
  if (arrival === "already") return t("arrived.already");
  if (arrival !== "joined") return null;
  const count = Number(place);
  return Number.isInteger(count) && count > 0
    ? t("arrived.joined", { count, ordinal: true })
    : t("arrived.joinedNoPlace");
};
