import { Pressable, Text, View } from "react-native";

export type ProfileAccountSectionProps = {
  onEditProfile: () => void;
};

export const ProfileAccountSection = ({ onEditProfile }: ProfileAccountSectionProps) => (
  <View className="mb-6 mt-8">
    <Text className="mb-3 text-lg font-semibold text-text-main dark:text-dark-text">Account Settings</Text>
    <Pressable
      onPress={onEditProfile}
      accessibilityRole="button"
      accessibilityLabel="Edit profile"
      className="mb-2 flex-row items-center justify-between rounded-lg bg-ui-background px-4 py-4 dark:bg-dark-surface"
    >
      <Text className="text-base font-medium text-text-main dark:text-dark-text">Edit Profile</Text>
      <Text className="text-2xl text-text-subtle dark:text-dark-text-subtle">›</Text>
    </Pressable>
  </View>
);
