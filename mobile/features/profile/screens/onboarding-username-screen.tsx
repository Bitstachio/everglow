import { Button } from "@/components/ui/button";
import { EdgePrint } from "@/components/ui/edge-print";
import { FilmGrain } from "@/components/ui/film-grain";
import { GreasePencil } from "@/components/ui/grease-pencil";
import { SafeAreaView } from "@/components/ui/safe-area-view";
import { Trans, useTranslation } from "react-i18next";
import { Text, View } from "react-native";
import { OnboardingField } from "../components/onboarding-field";
import { OnboardingStepBar } from "../components/onboarding-step-bar";
import { TermsCheck } from "../components/terms-check";
import { UsernameSuggestions } from "../components/username-suggestions";
import { useOnboardingUsernameScreen } from "../hooks/use-onboarding-username-screen";

const STATUS = {
  checking: { key: "username.checking", tone: "edge" },
  available: { key: "username.available", tone: "text" },
  taken: { key: "username.taken", tone: "pencil" },
} as const;

/**
 * 02.3–02.6 Username, and the terms. A pencil tick when the name is free; a
 * ring around the closest free one when it's taken; the rule in pencil when
 * it can't be used.
 */
const OnboardingUsernameScreen = () => {
  const { t } = useTranslation(["onboarding", "common"]);
  const {
    username,
    normalized,
    view,
    acceptedTerms,
    isLoading,
    canContinue,
    setUsername,
    pickSuggestion,
    toggleTerms,
    openTerms,
    openPrivacyPolicy,
    onBack,
    onContinue,
  } = useOnboardingUsernameScreen();
  const status = view.kind in STATUS ? STATUS[view.kind as keyof typeof STATUS] : null;

  return (
    <SafeAreaView className="flex-1 bg-ground">
      <OnboardingStepBar
        label={t("step", { step: 2, total: 3 })}
        onBack={onBack}
        backLabel={t("common:actions.back")}
      />

      <View className="px-5 pt-6">
        <View>
          <OnboardingField
            label={t("username.label")}
            size="handle"
            prefix="@"
            accessibilityLabel={t("username.fieldA11y")}
            value={username}
            onChangeText={setUsername}
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
            // A new handle: no password-manager bar over the keyboard.
            autoComplete="off"
            textContentType="none"
            returnKeyType="next"
            maxLength={60}
            status={
              status ? (
                <EdgePrint tone={status.tone} className={status.tone === "text" ? "font-mono-semibold" : ""}>
                  {t(status.key)}
                </EdgePrint>
              ) : null
            }
          />
          {view.kind === "available" ? (
            <View className="absolute -top-1 right-7">
              <GreasePencil mark="tick" width={26} height={26} seed={2} drawOn />
            </View>
          ) : null}
        </View>

        <View accessibilityLiveRegion="polite" className="mt-3 gap-1.5">
          {view.kind === "rule" || view.kind === "checking" ? <EdgePrint>{t("username.rule")}</EdgePrint> : null}
          {view.kind === "available" ? <EdgePrint>{t("username.changeLimit")}</EdgePrint> : null}
          {view.kind === "taken" ? (
            <>
              <EdgePrint tone="text" className="font-mono-semibold">
                {t(view.suggestions.length > 0 ? "username.takenFree" : "username.takenTryAnother", {
                  username: normalized,
                })}
              </EdgePrint>
              {view.suggestions.length > 0 ? (
                <View className="mt-2">
                  <UsernameSuggestions
                    suggestions={view.suggestions}
                    onPick={pickSuggestion}
                    pickLabel={(suggestion) => t("username.useSuggestion", { username: suggestion })}
                  />
                </View>
              ) : null}
            </>
          ) : null}
          {view.kind === "notAllowed" ? (
            <>
              <EdgePrint tone="pencil">{view.message}</EdgePrint>
              <EdgePrint>{t("username.ruleSentence")}</EdgePrint>
            </>
          ) : null}
          {view.kind === "notice" ? <EdgePrint tone="pencil">{view.message}</EdgePrint> : null}
        </View>

        {view.kind === "available" || acceptedTerms ? (
          <View className="mt-8.5">
            <TermsCheck checked={acceptedTerms} onToggle={toggleTerms} accessibilityLabel={t("username.termsA11y")}>
              <Trans
                t={t}
                i18nKey="username.terms"
                components={{
                  terms: (
                    <Text
                      accessibilityRole="link"
                      onPress={openTerms}
                      className="font-sans-semibold text-text underline"
                    />
                  ),
                  privacy: (
                    <Text
                      accessibilityRole="link"
                      onPress={openPrivacyPolicy}
                      className="font-sans-semibold text-text underline"
                    />
                  ),
                }}
              />
            </TermsCheck>
          </View>
        ) : null}
      </View>

      <View className="mt-auto px-5 pb-1">
        <Button
          title={t("username.continue")}
          mark="▸"
          onPress={() => void onContinue()}
          disabled={!canContinue}
          isLoading={isLoading}
        />
      </View>
      <FilmGrain />
    </SafeAreaView>
  );
};

export default OnboardingUsernameScreen;
