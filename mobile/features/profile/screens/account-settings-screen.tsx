import { Button } from "@/components/ui/button";
import { H2, H3 } from "@/components/ui/heading";
import { Spinner } from "@/components/ui/spinner";
import { ThemedText } from "@/components/ui/themed-text";
import { ScrollView, View } from "react-native";
import { SafeAreaView } from "@/components/ui/safe-area-view";
import { EditProfileModal } from "../components/edit-profile-modal";
import { SettingsRow } from "../components/settings-row";
import { useProfileScreen } from "../hooks/use-profile-screen";

const AccountSettingsScreen = () => {
  const {
    user,
    handleOpenUsage,
    isLoading,
    isDeleting,
    showEditModal,
    form,
    onSubmit,
    handleLogout,
    handleEditProfile,
    handleDeleteAccount,
    handleCancelEdit,
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
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            className="h-20 w-20 items-center justify-center rounded-full bg-accent"
          >
            <ThemedText className="text-3xl font-bold text-accent-foreground">
              {user.details?.name.trim().charAt(0).toUpperCase() || "E"}
            </ThemedText>
          </View>
          <View className="items-center gap-1">
            <H2>{user.details?.name || "Your profile"}</H2>
            <ThemedText tone="muted" className="text-sm">
              {user.details?.email || "No email added"}
            </ThemedText>
          </View>
          <Button title="Edit Profile" variant="outline" onPress={handleEditProfile} disabled={isDeleting} />
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
        <View className="gap-3">
          <H3>Security</H3>
          <View className="overflow-hidden rounded-2xl border border-border bg-surface">
            <SettingsRow
              title="Change Email Address"
              description="Update your profile email"
              icon="mail-outline"
              onPress={handleEditProfile}
              disabled={isDeleting}
            />
            <View className="h-px bg-border" />
            <SettingsRow
              title="Change Password"
              description="Password changes are not available in the app yet."
              icon="lock-closed-outline"
              disabled
            />
          </View>
        </View>
        <View className="gap-3">
          <H3>About</H3>
          <View className="overflow-hidden rounded-2xl border border-border bg-surface">
            <SettingsRow
              title="Privacy Policy"
              description="Not available yet"
              icon="shield-checkmark-outline"
              disabled
            />
            <View className="h-px bg-border" />
            <SettingsRow title="Terms of Use" description="Not available yet" icon="document-text-outline" disabled />
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
      <EditProfileModal
        visible={showEditModal}
        control={form.control}
        isSubmitting={form.formState.isSubmitting}
        isDirty={form.formState.isDirty}
        onSubmit={onSubmit}
        onCancel={handleCancelEdit}
      />
    </SafeAreaView>
  );
};

export default AccountSettingsScreen;
