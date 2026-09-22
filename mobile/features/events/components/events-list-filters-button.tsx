import { AppIcon } from "@/components/ui/app-icon";
import { Chip } from "@/components/ui/chip";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { colorTokens } from "@/theme/tokens";
import { Funnel } from "lucide-react-native";

type EventsListFiltersButtonProps = {
  onPress: () => void;
  active?: boolean;
};

export const EventsListFiltersButton = ({ onPress, active = false }: EventsListFiltersButtonProps) => {
  const colorScheme = useColorScheme();

  return (
    <Chip
      label={active ? "Filters · On" : "Filters"}
      accessibilityLabel="Filters"
      selected={active}
      onPress={onPress}
      className="self-start"
      icon={<AppIcon icon={Funnel} size="sm" color={colorTokens[colorScheme].muted} />}
    />
  );
};
