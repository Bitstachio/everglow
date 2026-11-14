import { EdgePrint, EdgeValue } from "@/components/ui/edge-print";
import { cn } from "@/lib/cn";
import { Trans, useTranslation } from "react-i18next";
import { View } from "react-native";
import type { EventResponseDto } from "../types";

type RollCapacityProps = {
  /** People on the roll, every role counted. */
  members: number;
  /** What the roll's plan allows; null for no limit. */
  limit: number | null;
  plan: EventResponseDto["plan"];
};

/** Past this many places, each cell stands for more than one, so the bar keeps its width. */
const MAX_CELLS = 30;

/** 11.1 How full the roll is: "24 of 30 on the free roll", the spots left, and a bar of places. */
export const RollCapacity = ({ members, limit, plan }: RollCapacityProps) => {
  const { t } = useTranslation("roll");
  const value = <EdgeValue>{null}</EdgeValue>;

  if (limit === null) {
    return (
      <EdgePrint>
        <Trans t={t} i18nKey="people.capacityNoLimit" values={{ count: members }} components={{ value }} />
      </EdgePrint>
    );
  }

  const left = Math.max(limit - members, 0);
  const cells = Math.min(limit, MAX_CELLS);
  const filled = Math.min(cells, Math.round((members / limit) * cells));
  const spots = left === 0 ? t("people.full") : t("people.spots", { count: left });

  return (
    <View
      accessible
      accessibilityLabel={t("people.capacityLabel", { count: members, limit, spots })}
      testID="roll-capacity"
    >
      <View className="flex-row justify-between gap-3">
        <EdgePrint>
          <Trans
            t={t}
            i18nKey="people.capacity"
            values={{ count: members, limit, plan: t(`people.plan.${plan}`) }}
            components={{ value }}
          />
        </EdgePrint>
        <EdgePrint>{spots}</EdgePrint>
      </View>
      <View className="mt-2.5 flex-row gap-[3px]">
        {Array.from({ length: cells }, (_, index) => (
          <View key={index} className={cn("h-2.5 flex-1 rounded-xs", index < filled ? "bg-text" : "bg-sprocket")} />
        ))}
      </View>
    </View>
  );
};
