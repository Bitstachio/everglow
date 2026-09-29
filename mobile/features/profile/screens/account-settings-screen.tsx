import { AppIcon } from "@/components/ui/app-icon";
import { Avatar } from "@/components/ui/avatar";
import { H2, H3 } from "@/components/ui/heading";
import { Spinner } from "@/components/ui/spinner";
import { ThemedText } from "@/components/ui/themed-text";
import { Camera } from "lucide-react-native";
import { Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "@/components/ui/safe-area-view";
import { SettingsRow } from "@/components/ui/settings-row";
import { useProfileScreen } from "../hooks/use-profile-screen";

const AccountSettingsScreen = () => {
  const {
    user,
    username,
    handleOpenUsername,
    handleOpenUsage,
    handleOpenDisplayName,
    handleOpenPrivacyPolicy,
    handleOpenTermsOfUse,
    hasAvatar,
    isUpdatingAvatar,
    handleChangeAvatar,
    canChangePassword,
    isChangingPassword,
    handleChangePassword,
    isLoading,
    isDeleting,
    handleLogout,
    handleDeleteAccount,
  } = useProfileScreen();
  if (isLoading)
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <Spinner label="Loading profile" />
      </View>
    );
  if (!user)
    return (
      <View className="flex-1 justify-center bg-background p-4">
        <ThemedText>Sign in to view your profile.</ThemedText>
      </View>
    );

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["left", "right", "bottom"]}>
      <ScrollView className="flex-1" contentContainerClassName="gap-6 px-4 pt-4 pb-6">
        <View className="items-center gap-4 rounded-2xl bg-surface p-6">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={hasAvatar ? "Change profile photo" : "Add profile photo"}
            accessibilityState={{ busy: isUpdatingAvatar, disabled: isDeleting || isUpdatingAvatar }}
            onPress={handleChangeAvatar}
            disabled={isDeleting || isUpdatingAvatar}
          >
            <Avatar userId={user.id} name={user.details?.name} uri={user.details?.avatarUrl} size="lg" />
            <View className="absolute -right-1 -bottom-1 h-8 w-8 items-center justify-center rounded-full border-2 border-surface bg-background">
              {isUpdatingAvatar ? (
                <Spinner label="Updating profile photo" />
              ) : (
                <AppIcon icon={Camera} size="sm" className="text-foreground" />
              )}
            </View>
          </Pressable>
          <View className="items-center gap-1">
            <H2>{user.details?.name || "Your profile"}</H2>
            <ThemedText tone="muted" className="text-sm">
              {username !== "Not set" ? `@${username}` : "No username set"}
            </ThemedText>
          </View>
        </View>

        <View className="overflow-hidden rounded-2xl border border-border bg-surface">
          <SettingsRow
            title="Username"
            description={username}
            icon="at-outline"
            onPress={handleOpenUsername}
            disabled={isDeleting}
          />
          <View className="h-px bg-border" />
          <SettingsRow
            title="Display Name"
            description={user.details?.name || "Not set"}
            icon="person-outline"
            onPress={handleOpenDisplayName}
            disabled={isDeleting}
          />
        </View>

        <View className="overflow-hidden rounded-2xl border border-border bg-surface">
          <SettingsRow
            title="Usage"
            description="View your photo storage"
            icon="pie-chart-outline"
            onPress={handleOpenUsage}
            disabled={isDeleting}
          />
        </View>
        {canChangePassword ? (
          <View className="gap-3">
            <H3>Security</H3>
            <View className="overflow-hidden rounded-2xl border border-border bg-surface">
              <SettingsRow
                title={isChangingPassword ? "Opening password page…" : "Change Password"}
                description="Update your sign-in password"
                icon="lock-closed-outline"
                onPress={handleChangePassword}
                disabled={isDeleting || isChangingPassword}
              />
            </View>
          </View>
        ) : null}
        <View className="gap-3">
          <H3>About</H3>
          <View className="overflow-hidden rounded-2xl border border-border bg-surface">
            <SettingsRow
              title="Privacy Policy"
              description="How we handle your data"
              icon="shield-checkmark-outline"
              onPress={handleOpenPrivacyPolicy}
              disabled={isDeleting}
            />
            <View className="h-px bg-border" />
            <SettingsRow
              title="Terms of Use"
              description="The rules for using Everglow"
              icon="document-text-outline"
              onPress={handleOpenTermsOfUse}
              disabled={isDeleting}
            />
          </View>
        </View>
        <View className="overflow-hidden rounded-2xl border border-border bg-surface">
          <SettingsRow title="Log Out" icon="log-out-outline" onPress={handleLogout} disabled={isDeleting} />
        </View>
        <View className="gap-3">
          <H3>Danger Zone</H3>
          <View className="overflow-hidden rounded-2xl border border-border bg-surface">
            <SettingsRow
              title={isDeleting ? "Deleting account…" : "Delete Account"}
              description="Permanently remove your account. You choose what happens to your shared photos."
              icon="trash-outline"
              onPress={handleDeleteAccount}
              destructive
              disabled={isDeleting}
            />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

export default AccountSettingsScreen;
