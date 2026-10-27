import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

type OrdinalCategory = "one" | "two" | "few" | "other";

/**
 * Which ordinal ending a place takes ("1st", "2nd", "3rd", "4th"). Hermes has
 * no ordinal plural rules, so i18next's own ordinal plurals always give "th"
 * on a device; where the engine has them they're used, else English's rule.
 */
export const ordinalCategory = (place: number, locale: string): OrdinalCategory => {
  try {
    const rules = new Intl.PluralRules(locale, { type: "ordinal" });
    // An engine without ordinal rules answers with the cardinal ones: 2 would be "other".
    if (rules.select(2) === "two") return rules.select(place) as OrdinalCategory;
  } catch {
    // No Intl.PluralRules at all.
  }
  const lastTwo = place % 100;
  if (lastTwo >= 11 && lastTwo <= 13) return "other";
  return ({ 1: "one", 2: "two", 3: "few" } as const)[(place % 10) as 1 | 2 | 3] ?? "other";
};

/** How long the note stays on the roll. */
export const ARRIVAL_NOTE_MS = 4000;

/**
 * The note a roll shows when an envelope opened it (06.6, 06.7), read from
 * the route: `arrival=joined&place=25` or `arrival=already`. It goes after a
 * few seconds and takes the params with it, so coming back doesn't repeat it.
 */
export const useArrivalNote = (): string | null => {
  const { t, i18n } = useTranslation("join");
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
    ? t(`arrived.joined.${ordinalCategory(count, i18n.language)}`, { place: count })
    : t("arrived.joinedNoPlace");
};
