import { BottomSheet } from "@/components/ui/bottom-sheet/bottom-sheet";
import { Button } from "@/components/ui/button";
import { FilmGrain } from "@/components/ui/film-grain";
import { IndexRow } from "@/components/ui/index-row";
import { LabCard } from "@/components/ui/lab-card";
import { SafeAreaView } from "@/components/ui/safe-area-view";
import { Slip } from "@/components/ui/slip";
import { Spinner } from "@/components/ui/spinner";
import { BackButton, TopBar } from "@/components/ui/top-bar";
import { useTranslation } from "react-i18next";
import { ScrollView, View } from "react-native";
import { useProfileScreen } from "../hooks/use-profile-screen";

/** 14.1 Lab card, and 14.10 the sign-out slip. Opened from your photo on Home. */
const AccountSettingsScreen = () => {
  const { t } = useTranslation(["you", "common"]);
  const {
    user,
    card,
    username,
    email,
    isLoading,
    isDeleting,
    isChangingPassword,
    signOutVisible,
    onBack,
    onEditCard,
    onOpenUsername,
    onOpenPassword,
    onOpenTerms,
    onOpenPrivacy,
    onSignOut,
    onCloseSignOut,
    onConfirmSignOut,
    onDeleteAccount,
  } = useProfileScreen();

  if (isLoading || !user) {
    return (
      <View className="flex-1 items-center justify-center bg-ground">
        <Spinner label={t("common:actions.loading")} />
      </View>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-ground">
      <TopBar
        title={t("title")}
        left={<BackButton accessibilityLabel={t("common:actions.back")} onPress={onBack} />}
        right={
          <Button title={t("edit")} variant="ghost" fullWidth={false} onPress={onEditCard} disabled={isDeleting} />
        }
      />

      <ScrollView className="flex-1" contentContainerClassName="px-5 pb-8 pt-4">
        <View className="px-0.5">
          <LabCard {...card} />
        </View>

        <View className="mt-8">
          <IndexRow label={t("index.username")} value={username} onPress={onOpenUsername} disabled={isDeleting} />
          <IndexRow label={t("index.email")} value={email} />
          <IndexRow
            label={t("index.password")}
            value={isChangingPassword ? t("index.passwordOpening") : undefined}
            onPress={onOpenPassword}
            disabled={isDeleting || isChangingPassword}
          />
          <IndexRow label={t("index.terms")} onPress={onOpenTerms} disabled={isDeleting} />
          <IndexRow label={t("index.privacy")} onPress={onOpenPrivacy} disabled={isDeleting} />
          <IndexRow label={t("index.signOut")} onPress={onSignOut} disabled={isDeleting} />
          <IndexRow
            muted
            label={t("index.delete")}
            value={isDeleting ? t("index.deleting") : undefined}
            onPress={onDeleteAccount}
            disabled={isDeleting}
          />
        </View>
      </ScrollView>

      <FilmGrain />

      <BottomSheet visible={signOutVisible} onClose={onCloseSignOut}>
        <Slip edge={email} title={t("signOut.title")} body={t("signOut.body")}>
          <Button title={t("signOut.confirm")} mark="⇥" onPress={onConfirmSignOut} />
          <Button title={t("signOut.cancel")} variant="secondary" mark="‹" onPress={onCloseSignOut} />
        </Slip>
      </BottomSheet>
    </SafeAreaView>
  );
};

export default AccountSettingsScreen;
