import { Text, View } from "react-native";
import { ProfileAvatar } from "../ProfileAvatar/ProfileAvatar";

export type ProfileHeaderProps = {
  name?: string;
  email?: string;
  avatarUrl?: string | null;
  isAvatarLoading?: boolean;
  onAvatarPress: () => void;
};

export const ProfileHeader = ({
  name,
  email,
  avatarUrl,
  isAvatarLoading = false,
  onAvatarPress,
}: ProfileHeaderProps) => (
  <View className="items-center py-8">
    <ProfileAvatar name={name} avatarUrl={avatarUrl} isLoading={isAvatarLoading} onPress={onAvatarPress} />
    <Text className="mb-1 text-2xl font-bold text-text-main dark:text-dark-text">{name || "User"}</Text>
    <Text className="text-base text-text-muted dark:text-dark-text-subtle">{email || "user@example.com"}</Text>
  </View>
);
