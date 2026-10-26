import { Button } from "@/components/ui/button";
import { EdgePrint } from "@/components/ui/edge-print";
import { GreasePencil } from "@/components/ui/grease-pencil";
import { normalizeUsername, type UsernameAvailabilityState } from "../lib/username";
import { Controller, type Control } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";
import { OnboardingField } from "./onboarding-field";

type EditUsernameFormProps = {
  control: Control<{ username: string }>;
  username: string;
  isDirty: boolean;
  isSubmitting: boolean;
  availability: UsernameAvailabilityState;
  fieldError?: string;
  error?: string;
  onSubmit: () => void;
};

/** 14.3 The new handle on a ruled line, a pencil tick when it's free, and the change on the leader. */
export const EditUsernameForm = ({
  control,
  username,
  isDirty,
  isSubmitting,
  availability,
  fieldError,
  error,
  onSubmit,
}: EditUsernameFormProps) => {
  const { t } = useTranslation("you");
  const normalized = normalizeUsername(username);
  const changed = isDirty && availability.username === normalized;
  const isFree = changed && availability.status === "available";
  const canSave = isFree && availability.canSubmit && !isSubmitting;
  const status =
    !changed || availability.status === "idle"
      ? null
      : availability.status === "checking"
        ? { label: t("username.checking"), tone: "edge" as const }
        : availability.status === "available"
          ? { label: t("username.available"), tone: "text" as const }
          : { label: t("username.taken"), tone: "pencil" as const };
  const problem = fieldError ?? (changed && availability.status !== "available" ? availability.message : null);

  return (
    <View className="flex-1">
      <View className="px-5 pt-6">
        <View>
          <Controller
            control={control}
            name="username"
            render={({ field }) => (
              <OnboardingField
                size="handle"
                prefix="@"
                accessibilityLabel={t("username.fieldA11y")}
                value={field.value}
                // Lowercased as typed, as in onboarding (02.3).
                onChangeText={(typed) => field.onChange(typed.toLowerCase())}
                onBlur={field.onBlur}
                autoFocus
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="off"
                textContentType="none"
                returnKeyType="done"
                maxLength={60}
                editable={!isSubmitting}
                onSubmitEditing={onSubmit}
                status={
                  status ? (
                    <EdgePrint tone={status.tone} className={status.tone === "text" ? "font-mono-semibold" : ""}>
                      {status.label}
                    </EdgePrint>
                  ) : null
                }
              />
            )}
          />
          {isFree ? (
            <View className="absolute -top-7 right-7">
              <GreasePencil mark="tick" width={26} height={26} seed={3} drawOn />
            </View>
          ) : null}
        </View>

        <View accessibilityLiveRegion="polite" className="mt-3 gap-1.5">
          {problem && availability.status !== "checking" ? <EdgePrint tone="pencil">{problem}</EdgePrint> : null}
          <EdgePrint tone="text">{t("username.limit")}</EdgePrint>
        </View>
        <Text className="mt-3 font-sans text-body text-text-2">{t("username.body")}</Text>
        {error ? (
          <Text accessibilityRole="alert" className="mt-3 font-sans text-body text-pencil">
            {error}
          </Text>
        ) : null}
      </View>

      <View className="mt-auto px-5 pb-1">
        <Button
          title={t("username.change", { username: normalized })}
          mark="✓"
          onPress={onSubmit}
          isLoading={isSubmitting}
          disabled={!canSave}
        />
      </View>
    </View>
  );
};
