import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { ThemedText } from "@/components/ui/themed-text";
import { vars } from "nativewind";
import { View } from "react-native";
import type { UserStorageResponseDto } from "../types";

const formatBytes = (bytes: string) => {
  const value = Number(bytes);
  if (value === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(Math.max(value, 1)) / Math.log(1024)), units.length - 1);
  return `${(value / 1024 ** index).toLocaleString(undefined, { maximumFractionDigits: 1 })} ${units[index]}`;
};

type StorageCardProps = {
  storage?: UserStorageResponseDto;
  isLoading: boolean;
  isError: boolean;
  isFetching: boolean;
  onRetry: () => void;
};

const StorageDetail = ({ label, value }: { label: string; value: string }) => (
  <View className="flex-row flex-wrap items-center justify-between gap-3">
    <ThemedText className="text-base">{label}</ThemedText>
    <ThemedText className="text-base font-semibold">{value}</ThemedText>
  </View>
);

export const StorageCard = ({ storage, isLoading, isError, isFetching, onRetry }: StorageCardProps) => {
  const used = Number(storage?.usedBytes ?? 0);
  const limit = Number(storage?.limitBytes ?? 0);
  const percentage = limit > 0 ? Math.round((used / limit) * 100) : used > 0 ? 100 : 0;
  const progress = Math.min(100, Math.max(0, percentage));
  return (
    <View className="gap-6 rounded-2xl border border-border bg-surface p-4">
      {isLoading ? (
        <Spinner label="Loading storage" />
      ) : storage ? (
        <>
          <View className="gap-3">
            <View className="flex-row flex-wrap items-center justify-between gap-3">
              <ThemedText className="text-base font-semibold">
                {formatBytes(storage.usedBytes)} of {formatBytes(storage.limitBytes)} used
              </ThemedText>
              <ThemedText tone="accent" className="text-base font-semibold">
                {percentage}%
              </ThemedText>
            </View>
            <View
              accessible
              accessibilityRole="progressbar"
              accessibilityLabel="Storage usage"
              accessibilityValue={{ min: 0, max: 100, now: progress, text: `${percentage}% used` }}
              className="h-3 overflow-hidden rounded-full bg-border"
            >
              {/* NativeWind variables keep the data-driven width in a Tailwind utility. */}
              <View
                className="h-full w-[var(--usage-width)] rounded-full bg-accent"
                style={vars({ "--usage-width": `${progress}%` })}
              />
            </View>
          </View>
          <View className="h-px bg-border" />
          <View className="gap-4">
            <StorageDetail label="Storage used" value={formatBytes(storage.usedBytes)} />
            <StorageDetail label="Remaining" value={formatBytes(storage.remainingBytes)} />
            <StorageDetail label="Limit" value={formatBytes(storage.limitBytes)} />
            <StorageDetail
              label="Photos stored"
              value={storage.photosStored == null ? "Unavailable" : storage.photosStored.toLocaleString()}
            />
          </View>
        </>
      ) : null}
      {isError ? (
        <View className="gap-3">
          <ThemedText accessibilityRole="alert" tone="muted" className="text-sm">
            Could not refresh your storage usage.
          </ThemedText>
          <Button title="Retry" variant="outline" onPress={onRetry} isLoading={isFetching} disabled={isFetching} />
        </View>
      ) : null}
    </View>
  );
};
