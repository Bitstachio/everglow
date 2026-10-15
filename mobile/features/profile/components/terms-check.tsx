import { GreasePencil } from "@/components/ui/grease-pencil";
import { type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";

type TermsCheckProps = {
  checked: boolean;
  onToggle: () => void;
  accessibilityLabel: string;
  /** The sentence, with its links. */
  children: ReactNode;
};

/** A drawn box ticked in pencil, and the sentence it agrees to. */
export const TermsCheck = ({ checked, onToggle, accessibilityLabel, children }: TermsCheckProps) => (
  <View className="flex-row items-start gap-3">
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked }}
      onPress={onToggle}
      hitSlop={13}
      className="mt-0.5 size-4.5 border-[1.5px] border-text"
    >
      {checked ? (
        <View className="absolute -left-1 -top-1.5">
          <GreasePencil mark="tick" width={22} height={24} strokeWidth={2.5} seed={6} drawOn />
        </View>
      ) : null}
    </Pressable>
    <Text className="flex-1 font-sans text-body text-text-2">{children}</Text>
  </View>
);
