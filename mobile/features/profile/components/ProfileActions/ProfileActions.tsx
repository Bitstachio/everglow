import { Pressable, Text, View } from "react-native";
import { Button } from "@/components/ui/button";

export type ProfileActionsProps = {
  onLogout: () => void;
  onDeleteAccount: () => void;
  isLogoutLoading?: boolean;
  isDeletingAccount?: boolean;
};

export const ProfileActions = ({
  onLogout,
  onDeleteAccount,
  isLogoutLoading = false,
  isDeletingAccount = false,
}: ProfileActionsProps) => (
  <View className="mt-auto pb-6">
    <Button title="Logout" onPress={onLogout} isLoading={isLogoutLoading} variant="outline" />
    <Pressable
      onPress={onDeleteAccount}
      disabled={isDeletingAccount}
      accessibilityRole="button"
      accessibilityLabel="Delete account"
      className="mt-3 items-center rounded-lg border border-status-danger px-4 py-4 dark:bg-dark-surface"
    >
      <Text className="text-base font-medium text-status-danger">
        {isDeletingAccount ? "Deleting..." : "Delete Account"}
      </Text>
    </Pressable>
  </View>
);
