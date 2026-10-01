import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { ThemedText } from "@/components/ui/themed-text";
import { vars } from "nativewind";
import { View } from "react-native";
import type { UserLimitsResponseDto } from "../types";

const PLAN_LABELS: Record<UserLimitsResponseDto["plan"], string> = {
  FREE: "Free plan",
};

const describeActiveEvents = (active: number, limit: number | null) =>
  limit === null ? `${active} active ${active === 1 ? "event" : "events"}` : `${active} of ${limit} active events`;

const formatCloseDate = (value: string) =>
  new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric" });

type ActiveEventsCardProps = {
  limits?: UserLimitsResponseDto;
  isLoading: boolean;
  isError: boolean;
  isFetching: boolean;
  onRetry: () => void;
};

export const ActiveEventsCard = ({ limits, isLoading, isError, isFetching, onRetry }: ActiveEventsCardProps) => {
  const active = limits?.usage.activeEvents ?? 0;
  // null: the plan has no limit, so there is nothing to fill a bar against.
  const limit = limits?.limits.activeEvents ?? null;
  const progress = limit ? Math.min(100, Math.round((active / limit) * 100)) : 0;
  const next = limits?.nextClosingEvent;
  return (
    <View className="gap-6 rounded-2xl border border-border bg-surface p-4">
      {isLoading ? (
        <Spinner label="Loading active events" />
      ) : limits ? (
        <>
          <View className="gap-3">
            <View className="flex-row flex-wrap items-center justify-between gap-3">
              <ThemedText className="text-base font-semibold">{describeActiveEvents(active, limit)}</ThemedText>
              <ThemedText tone="accent" className="text-base font-semibold">
                {PLAN_LABELS[limits.plan]}
              </ThemedText>
            </View>
            {limit === null ? null : (
              <View
                accessible
                accessibilityRole="progressbar"
                accessibilityLabel="Active events"
                accessibilityValue={{ min: 0, max: limit, now: Math.min(active, limit), text: `${active} of ${limit}` }}
                className="h-3 overflow-hidden rounded-full bg-border"
              >
                {/* NativeWind variables keep the data-driven width in a Tailwind utility. */}
                <View
                  className="h-full w-[var(--usage-width)] rounded-full bg-accent"
                  style={vars({ "--usage-width": `${progress}%` })}
                />
              </View>
            )}
          </View>
          {next ? (
            <>
              <View className="h-px bg-border" />
              <View className="flex-row flex-wrap items-center justify-between gap-3">
                <ThemedText className="text-base">Next to close</ThemedText>
                <ThemedText className="text-base font-semibold">
                  {`${next.title}, ${formatCloseDate(next.galleryClosesAt)}`}
                </ThemedText>
              </View>
            </>
          ) : null}
        </>
      ) : null}
      {isError ? (
        <View className="gap-3">
          <ThemedText accessibilityRole="alert" tone="muted" className="text-sm">
            Could not refresh your active events.
          </ThemedText>
          <Button title="Retry" variant="outline" onPress={onRetry} isLoading={isFetching} disabled={isFetching} />
        </View>
      ) : null}
    </View>
  );
};
