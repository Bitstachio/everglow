import { H2 } from "@/components/ui/heading";
import { IconButton } from "@/components/ui/icon-button";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { colorTokens } from "@/theme/tokens";
import { Ionicons } from "@expo/vector-icons";
import { type ReactNode } from "react";
import { Animated, Modal, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBottomSheetPresentation } from "./use-bottom-sheet";

type BottomSheetProps = {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: string;
  testID?: string;
  dismissAccessibilityLabel?: string;
  closeAccessibilityLabel?: string;
};

export const BottomSheet = ({
  visible,
  onClose,
  children,
  title,
  testID,
  dismissAccessibilityLabel = "Dismiss",
  closeAccessibilityLabel = "Close",
}: BottomSheetProps) => {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const { presented, scrimOpacity, sheetTranslateY, pointerEvents } = useBottomSheetPresentation(visible);

  return (
    <Modal testID={testID} animationType="none" visible={presented} transparent onRequestClose={onClose}>
      <View className="flex-1 justify-end" pointerEvents={pointerEvents}>
        <View className="absolute inset-0">
          <Animated.View style={{ flex: 1, opacity: scrimOpacity }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={dismissAccessibilityLabel}
              className="flex-1 bg-scrim"
              onPress={onClose}
            />
          </Animated.View>
        </View>

        <Animated.View style={{ transform: [{ translateY: sheetTranslateY }] }}>
          <View className="rounded-t-3xl bg-background px-4 pt-3" style={{ paddingBottom: 24 + insets.bottom }}>
            <View className="gap-4">
              <View className="items-center">
                <View className="h-1 w-10 rounded-full bg-border" />
              </View>

              {title ? (
                <View className="flex-row items-center justify-between gap-3">
                  <H2 className="flex-1">{title}</H2>
                  <IconButton accessibilityLabel={closeAccessibilityLabel} onPress={onClose} className="bg-surface">
                    <Ionicons name="close" size={18} color={colorTokens[colorScheme].muted} />
                  </IconButton>
                </View>
              ) : null}

              <View className="gap-6">{children}</View>
            </View>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
};
