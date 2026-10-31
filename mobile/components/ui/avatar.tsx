import { AppIcon } from "@/components/ui/app-icon";
import { ThemedText } from "@/components/ui/themed-text";
import { colorTokens } from "@/theme/tokens";
import { Image } from "expo-image";
import { Ghost } from "phosphor-react-native";
import { useState } from "react";
import { View } from "react-native";

type AvatarSize = "caption" | "md" | "header" | "lg" | "fill";

type AvatarProps = {
  userId: string;
  name: string | null | undefined;
  /** Short-lived presigned URL; null when the user has no avatar. */
  uri: string | null | undefined;
  size?: AvatarSize;
};

// Caption portraits and the header are round; larger portraits are paper prints.
const SIZE_CLASSES: Record<AvatarSize, { container: string; text: string }> = {
  caption: { container: "size-4 rounded-full border border-edge", text: "text-frame-label" },
  md: { container: "h-10 w-10 rounded-paper", text: "text-base" },
  header: { container: "size-10 rounded-full", text: "text-lg" },
  lg: { container: "h-20 w-20 rounded-paper", text: "text-3xl" },
  /** As large as its parent, square-cornered: a print such as a report's subject. */
  fill: { container: "h-full w-full", text: "text-5xl" },
};

const FILL = { width: "100%", height: "100%" } as const;

// The ghost fills a little over half the portrait at every size.
const GHOST_PX: Record<AvatarSize, number> = { caption: 10, md: 22, header: 22, lg: 44 };

export const getInitial = (name: string | null | undefined): string => name?.trim().charAt(0).toUpperCase() || "E";

/**
 * Avatar URLs are re-signed on every fetch and expire after 15 minutes, so the
 * full URL is useless as a cache key. The path names the uploaded object
 * (`avatars/{userId}/{uploadId}`) and only changes when the avatar does.
 */
export const getAvatarCacheKey = (userId: string, uri: string): string => {
  const path = uri.split("?")[0];
  return `avatar:${userId}:${path}`;
};

export const Avatar = ({ userId, name, uri, size = "md" }: AvatarProps) => {
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const classes = SIZE_CLASSES[size];
  const showImage = Boolean(uri) && uri !== failedUri;

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className={`${classes.container} items-center justify-center overflow-hidden bg-frame-empty`}
    >
      {showImage && uri ? (
        <Image
          testID="avatar-image"
          source={{ uri, cacheKey: getAvatarCacheKey(userId, uri) }}
          style={FILL}
          contentFit="cover"
          cachePolicy="memory-disk"
          transition={150}
          onError={() => setFailedUri(uri)}
        />
      ) : (
        <ThemedText className={`${classes.text} font-display text-text`}>{getInitial(name)}</ThemedText>
      )}
    </View>
  );
};

/**
 * The portrait of an uploader who deleted their account: one ghost for every
 * such person, so frames can't be grouped back to whoever took them.
 */
export const DeletedAvatar = ({ size = "md" }: { size?: AvatarSize }) => (
  <View
    testID="deleted-avatar"
    accessibilityElementsHidden
    importantForAccessibility="no-hide-descendants"
    className={`${SIZE_CLASSES[size].container} items-center justify-center overflow-hidden bg-frame-empty`}
  >
    <AppIcon icon={Ghost} size={GHOST_PX[size]} color={colorTokens.muted} />
  </View>
);
