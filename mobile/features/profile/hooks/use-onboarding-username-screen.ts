import { useAuth } from "@/context/auth-context";
import { getErrorCode, getErrorMessage } from "@/lib/api/errors";
import { router } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert } from "react-native";
import { normalizeUsername, usernameRuleBreak, type UsernameRuleBreak } from "../lib/username";
import { useOnboardingDraft } from "../onboarding-draft";
import { useUsernameAvailability } from "./use-username-availability";

/** What the username step shows under the field. */
export type UsernameView =
  | { kind: "rule" }
  | { kind: "checking" }
  | { kind: "available" }
  | { kind: "taken"; suggestions: string[] }
  | { kind: "notAllowed"; message: string }
  | { kind: "notice"; message: string };

/**
 * 02.3–02.6 Username, and the terms. Lowercase as you type; the rule is
 * checked on the phone first, then availability after a short pause. A taken
 * or reserved name offers free ones built from your name. Continue sends
 * name, username and accepted terms together, which completes onboarding,
 * then goes on to the photo.
 */
export const useOnboardingUsernameScreen = () => {
  const { t } = useTranslation(["onboarding", "common"]);
  const { completeOnboarding, isLoading } = useAuth();
  const { name, username, setUsername, acceptedTerms, setAcceptedTerms } = useOnboardingDraft();
  // A name can go between the check and the submit; the API then says USERNAME_TAKEN.
  const [takenOnSubmit, setTakenOnSubmit] = useState<string | null>(null);
  const availability = useUsernameAvailability(username, { name: name.trim() });
  const normalized = normalizeUsername(username);

  const joinOr = (items: string[]) =>
    items.length === 1 ? items[0] : t("username.listOr", { head: items.slice(0, -1).join(", "), last: items.at(-1) });

  const notAllowedMessage = (ruleBreak: Exclude<UsernameRuleBreak, { kind: "tooShort" }>) => {
    if (ruleBreak.kind === "tooLong") return t("username.tooLong");
    const items = [
      ...(ruleBreak.spaces ? [t("username.spaces")] : []),
      ...ruleBreak.characters.map((character) => `“${character}”`),
    ];
    return t("username.notAllowed", { list: joinOr(items) });
  };

  const view = ((): UsernameView => {
    const ruleBreak = usernameRuleBreak(username);
    // Too short is just the rule while typing, not a mistake.
    if (ruleBreak && ruleBreak.kind !== "tooShort")
      return { kind: "notAllowed", message: notAllowedMessage(ruleBreak) };
    if (takenOnSubmit && takenOnSubmit === normalized) return { kind: "taken", suggestions: [] };

    switch (availability.status) {
      case "checking":
        return { kind: "checking" };
      case "available":
        return { kind: "available" };
      case "paused":
        return { kind: "notice", message: t("username.paused") };
      case "unavailable":
        if (availability.reason === "TAKEN" || availability.reason === "RESERVED") {
          return { kind: "taken", suggestions: availability.suggestions };
        }
        if (availability.reason === "INVALID_FORMAT") return { kind: "rule" };
        return { kind: "notice", message: t("username.checkFailed") };
      default:
        return { kind: "rule" };
    }
  })();

  const canContinue = view.kind === "available" && acceptedTerms && !isLoading;

  const onContinue = async () => {
    if (!canContinue) return;
    try {
      await completeOnboarding({ name: name.trim(), username: normalized, acceptedTerms: true });
      router.replace("/onboarding/photo");
    } catch (err) {
      const code = getErrorCode(err);
      if (code === "USERNAME_TAKEN" || code === "USERNAME_RESERVED") {
        setTakenOnSubmit(normalized);
        return;
      }
      Alert.alert(t("username.failedTitle"), getErrorMessage(err, t("common:actions.tryAgain")));
    }
  };

  return {
    username,
    normalized,
    view,
    acceptedTerms,
    isLoading,
    canContinue,
    setUsername: (typed: string) => setUsername(typed.toLowerCase()),
    pickSuggestion: (suggestion: string) => setUsername(suggestion),
    toggleTerms: () => setAcceptedTerms(!acceptedTerms),
    openTerms: () => router.push("/terms-of-use"),
    openPrivacyPolicy: () => router.push("/privacy-policy"),
    onBack: () => router.back(),
    onContinue,
  };
};
