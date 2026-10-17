import { getAvatarCacheKey } from "@/components/ui/avatar";
import { useAuth } from "@/context/auth-context";
import { useTranslation } from "react-i18next";
import { useMyLimitsQuery } from "../api/queries";

/**
 * The signed-in person's lab card: name, username, photo and how many rolls
 * they're running, with the plan's limit read from the API.
 */
export const useLabCard = () => {
  const { t, i18n } = useTranslation("onboarding");
  const { user } = useAuth();
  const { data: limits } = useMyLimitsQuery();
  const details = user?.details;

  const since = user
    ? new Intl.DateTimeFormat(i18n.language, { month: "short", year: "numeric" }).format(new Date(user.createdAt))
    : "";
  const running = limits
    ? limits.limits.activeEvents == null
      ? t("card.runningNoLimit", { count: limits.usage.activeEvents })
      : t("card.running", { count: limits.usage.activeEvents, limit: limits.limits.activeEvents })
    : undefined;

  return {
    firstName: details?.name.trim().split(/\s+/)[0] ?? "",
    card: {
      title: t("card.title", { since }),
      photoUri: details?.avatarUrl ?? undefined,
      photoCacheKey: user && details?.avatarUrl ? getAvatarCacheKey(user.id, details.avatarUrl) : undefined,
      fields: [
        { label: t("card.name"), value: details?.name },
        { label: t("card.signsAs"), value: details ? `@${details.username}` : undefined },
        { label: limits?.plan === "FREE" ? t("card.freeRoll") : t("card.rolls"), value: running },
      ],
      accessibilityLabel: t("card.a11y", { name: details?.name ?? "", username: details?.username ?? "" }),
    },
  };
};
