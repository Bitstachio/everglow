import { AppIcon } from "@/components/ui/app-icon";
import { EdgePrint } from "@/components/ui/edge-print";
import { Sprockets } from "@/components/ui/film-strip";
import { Photo } from "@/components/ui/photo";
import { colorTokens } from "@/theme/tokens";
import { ImageSquare } from "phosphor-react-native";
import { Pressable, View } from "react-native";

type TrayRowProps = {
  uri: string;
  status: string;
  accessibilityLabel: string;
  done?: boolean;
  actions?: { title: string; accessibilityLabel: string; onPress: () => void }[];
};

/** A small square film print beside its upload status and recovery actions. */
export const TrayRow = ({ uri, status, accessibilityLabel, done = false, actions }: TrayRowProps) => (
  <View className="flex-row items-center gap-4 border-b border-line py-3">
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className="h-20 w-20 shrink-0 bg-rebate p-3"
    >
      <Sprockets edge="top" count={5} />
      <View className="aspect-square w-full items-center justify-center overflow-hidden rounded-frame bg-frame-empty">
        {uri ? (
          <Photo testID="tray-row-photo" source={{ uri }} contentFit="cover" className="h-full w-full" />
        ) : (
          <View className="opacity-40">
            <AppIcon icon={ImageSquare} size="sm" color={colorTokens.text} />
          </View>
        )}
      </View>
      <Sprockets edge="bottom" count={5} />
    </View>
    <View className="flex-1 items-end justify-center">
      <EdgePrint accessibilityLabel={accessibilityLabel} tone={done ? "text" : "edge"} className="text-right">
        {status}
      </EdgePrint>
      {actions?.length ? (
        <View className="flex-row flex-wrap justify-end gap-x-5">
          {actions.map((action) => (
            <Pressable
              key={action.accessibilityLabel}
              accessibilityRole="button"
              accessibilityLabel={action.accessibilityLabel}
              onPress={action.onPress}
              className="min-h-11 justify-center active:opacity-60"
            >
              <EdgePrint tone="text">{action.title}</EdgePrint>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  </View>
);
