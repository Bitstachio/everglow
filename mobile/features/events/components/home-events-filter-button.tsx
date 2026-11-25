import { AppIcon } from "@/components/ui/app-icon";
import { EdgePrint } from "@/components/ui/edge-print";
import { colorTokens } from "@/theme/tokens";
import { Funnel } from "phosphor-react-native";
import { useTranslation } from "react-i18next";
import { Pressable } from "react-native";

type HomeEventsFilterButtonProps = {
  onPress: () => void;
  active?: boolean;
};

/** Opens the home filter / sort sheet. Active when any filter is applied. */
export const HomeEventsFilterButton = ({ onPress, active = false }: HomeEventsFilterButtonProps) => {
  const { t } = useTranslation("home");
  const label = active ? t("filters.on") : t("filters.label");

  return (
    <Pressable
      testID="home-events-filter"
      accessibilityRole="button"
      accessibilityLabel={t("filters.label")}
      accessibilityState={{ selected: active }}
      hitSlop={8}
      onPress={onPress}
      className={[
        "h-9 flex-row items-center gap-1.5 rounded-paper border px-3 active:bg-sheet",
        active ? "border-text" : "border-outline-soft",
      ].join(" ")}
    >
      <AppIcon icon={Funnel} size="xs" color={active ? colorTokens.text : colorTokens.edge} />
      <EdgePrint tone={active ? "text" : "edge"}>{label}</EdgePrint>
    </Pressable>
  );
};
