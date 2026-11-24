import { AppIcon } from "@/components/ui/app-icon";
import { Chip } from "@/components/ui/chip";
import { colorTokens } from "@/theme/tokens";
import { Funnel } from "phosphor-react-native";
import { useTranslation } from "react-i18next";

type HomeEventsFilterButtonProps = {
  onPress: () => void;
  active?: boolean;
};

/** Opens the home filter / sort sheet. Active when any filter is applied. */
export const HomeEventsFilterButton = ({ onPress, active = false }: HomeEventsFilterButtonProps) => {
  const { t } = useTranslation("home");

  return (
    <Chip
      testID="home-events-filter"
      label={active ? t("filters.on") : t("filters.label")}
      accessibilityLabel={t("filters.label")}
      selected={active}
      onPress={onPress}
      className="self-start"
      icon={<AppIcon icon={Funnel} size="sm" color={colorTokens.text} />}
    />
  );
};
