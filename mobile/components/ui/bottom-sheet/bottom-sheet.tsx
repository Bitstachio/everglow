import { ThemedText } from "@/components/ui/themed-text";
import { Ionicons } from "@expo/vector-icons";
import { type ReactNode } from "react";
import { Animated, Modal, Pressable, View } from "react-native";
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
          <View className="rounded-t-3xl bg-background px-6 pb-8 pt-3 gap-6">
            <View className="items-center">
              <View className="h-1 w-10 rounded-full bg-border" />
            </View>

            {title ? (
              <View className="flex-row items-center justify-between">
                <ThemedText className="text-xl font-bold">{title}</ThemedText>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={closeAccessibilityLabel}
                  onPress={onClose}
                  className="h-9 w-9 items-center justify-center rounded-full bg-surface"
                >
                  <Ionicons name="close" size={18} color="#64748B" />
                </Pressable>
              </View>
            ) : null}

            {children}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
};
