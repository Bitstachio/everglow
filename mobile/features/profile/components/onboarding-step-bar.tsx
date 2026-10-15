import { EdgePrint } from "@/components/ui/edge-print";
import { IconButton } from "@/components/ui/icon-button";
import { colorTokens } from "@/theme/tokens";
import { CaretLeft } from "phosphor-react-native";
import { type ReactNode } from "react";
import { View } from "react-native";

type OnboardingStepBarProps = {
  /** "Step 2 of 3", already translated. */
  label: string;
  /** Shows the back button when set. */
  onBack?: () => void;
  backLabel: string;
  /** A text button on the right, such as Skip. */
  action?: ReactNode;
};

/** The onboarding top bar: back on the left, the step in edge print in the middle, an action on the right. */
export const OnboardingStepBar = ({ label, onBack, backLabel, action }: OnboardingStepBarProps) => (
  <View className="h-14 flex-row items-center px-5">
    <View className="flex-1 items-start">
      {onBack ? (
        <IconButton accessibilityLabel={backLabel} onPress={onBack}>
          <CaretLeft size={18} weight="bold" color={colorTokens.text} />
        </IconButton>
      ) : null}
    </View>
    <EdgePrint>{label}</EdgePrint>
    <View className="flex-1 items-end">{action}</View>
  </View>
);
