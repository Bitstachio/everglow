import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { Image } from "expo-image";

export type ProfileAvatarProps = {
  name?: string;
  avatarUrl?: string | null;
  isLoading?: boolean;
  onPress: () => void;
};

export const ProfileAvatar = ({ name, avatarUrl, isLoading = false, onPress }: ProfileAvatarProps) => {
  const initial = name?.charAt(0).toUpperCase() || "U";

  return (
    <Pressable
      onPress={onPress}
      disabled={isLoading}
      accessibilityRole="button"
      accessibilityLabel="Change profile photo"
      className="relative mb-4"
    >
      {avatarUrl ? (
        <Image source={{ uri: avatarUrl }} className="h-20 w-20 rounded-full" contentFit="cover" />
      ) : (
        <View className="h-20 w-20 items-center justify-center rounded-full bg-brand-primary">
          <Text className="text-3xl font-bold text-white">{initial}</Text>
        </View>
      )}
      {isLoading && (
        <View className="absolute inset-0 items-center justify-center rounded-full bg-black/40">
          <ActivityIndicator color="#FFFFFF" />
        </View>
      )}
    </Pressable>
  );
};
