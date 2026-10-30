import { H2 } from "@/components/ui/heading";
import { IconButton } from "@/components/ui/icon-button";
import i18n from "@/i18n/instance";
import { colorTokens } from "@/theme/tokens";
import { Ionicons } from "@expo/vector-icons";
import { type ReactNode } from "react";
import { Animated, Modal, Platform, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBottomSheetPresentation } from "./use-bottom-sheet";

type BottomSheetProps = {
  visible: boolean;
  onClose: () => void;
  /** After the sheet has fully gone, for something that must not open over it. */
  onClosed?: () => void;
  children: ReactNode;
  title?: string;
  testID?: string;
  dismissAccessibilityLabel?: string;
  closeAccessibilityLabel?: string;
};

export const BottomSheet = ({
  visible,
  onClose,
  onClosed,
  children,
  title,
  testID,
  dismissAccessibilityLabel,
  closeAccessibilityLabel,
}: BottomSheetProps) => {
  const insets = useSafeAreaInsets();
  const { presented, scrimOpacity, sheetTranslateY, pointerEvents } = useBottomSheetPresentation(
    visible,
    Platform.OS === "ios" ? undefined : onClosed,
  );
  const dismissLabel = dismissAccessibilityLabel ?? i18n.t("actions.dismiss", { ns: "common" });
  const closeLabel = closeAccessibilityLabel ?? i18n.t("actions.close", { ns: "common" });

  return (
    <Modal
      testID={testID}
      animationType="none"
      visible={presented}
      transparent
      onRequestClose={onClose}
      onDismiss={
        Platform.OS === "ios"
          ? () => {
              if (!visible) onClosed?.();
            }
          : undefined
      }
    >
      <View className="flex-1 justify-end" pointerEvents={pointerEvents}>
        <View className="absolute inset-0">
          <Animated.View style={{ flex: 1, opacity: scrimOpacity }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={dismissLabel}
              className="flex-1 bg-scrim"
              onPress={onClose}
            />
          </Animated.View>
        </View>

        <Animated.View style={{ transform: [{ translateY: sheetTranslateY }] }}>
          <View className="border-t-2 border-text bg-sheet px-5 pt-5" style={{ paddingBottom: 24 + insets.bottom }}>
            <View className="gap-4">
              {title ? (
                <View className="flex-row items-center justify-between gap-3">
                  <H2 className="flex-1">{title}</H2>
                  <IconButton accessibilityLabel={closeLabel} onPress={onClose}>
                    <Ionicons name="close" size={18} color={colorTokens.muted} />
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
