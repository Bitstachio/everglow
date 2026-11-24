import { BottomSheet } from "@/components/ui/bottom-sheet/bottom-sheet";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { EdgePrint } from "@/components/ui/edge-print";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import type { AccessLevel } from "../types";
import {
  HOME_EVENTS_ROLE_OPTIONS,
  HOME_EVENTS_STATUS_OPTIONS,
  type HomeEventsFilters,
  type HomeEventsGalleryStatus,
} from "../lib/home-events-filters";
import type { EventsListSortDirection } from "../utils";

type HomeEventsFiltersSheetProps = {
  visible: boolean;
  draft: HomeEventsFilters;
  onClose: () => void;
  onToggleStatus: (status: HomeEventsGalleryStatus) => void;
  onToggleRole: (role: AccessLevel) => void;
  onChangeSort: (direction: EventsListSortDirection) => void;
  onReset: () => void;
  onApply: () => void;
};

const STATUS_LABEL_KEY: Record<HomeEventsGalleryStatus, "open" | "upcoming" | "closed"> = {
  OPEN: "open",
  UPCOMING: "upcoming",
  CLOSED: "closed",
};

export const HomeEventsFiltersSheet = ({
  visible,
  draft,
  onClose,
  onToggleStatus,
  onToggleRole,
  onChangeSort,
  onReset,
  onApply,
}: HomeEventsFiltersSheetProps) => {
  const { t } = useTranslation("home");

  return (
    <BottomSheet
      testID="home-events-filters-sheet"
      visible={visible}
      onClose={onClose}
      title={t("filters.sheetTitle")}
      dismissAccessibilityLabel={t("filters.dismiss")}
      closeAccessibilityLabel={t("filters.close")}
    >
      <View className="gap-3">
        <EdgePrint>{t("filters.status")}</EdgePrint>
        <View className="flex-row gap-2">
          {HOME_EVENTS_STATUS_OPTIONS.map((status) => {
            const label = t(`event.status.${STATUS_LABEL_KEY[status]}`);
            return (
              <Chip
                key={status}
                label={label}
                selected={draft.statuses.includes(status)}
                accessibilityLabel={t("filters.statusA11y", { status: label })}
                onPress={() => onToggleStatus(status)}
                className="flex-1"
              />
            );
          })}
        </View>
      </View>

      <View className="gap-3">
        <EdgePrint>{t("filters.role")}</EdgePrint>
        <View className="flex-row flex-wrap gap-2">
          {HOME_EVENTS_ROLE_OPTIONS.map((role) => {
            const label = t(`filters.roles.${role}`);
            return (
              <Chip
                key={role}
                label={label}
                selected={draft.roles.includes(role)}
                accessibilityLabel={t("filters.roleA11y", { role: label })}
                onPress={() => onToggleRole(role)}
                className="flex-1"
              />
            );
          })}
        </View>
      </View>

      <View className="gap-3">
        <EdgePrint>{t("filters.sort")}</EdgePrint>
        <View className="flex-row gap-2">
          <Chip
            label={t("filters.sortEarliest")}
            selected={draft.sortDirection === "asc"}
            accessibilityLabel={t("filters.sortEarliest")}
            onPress={() => onChangeSort("asc")}
            className="flex-1"
          />
          <Chip
            label={t("filters.sortLatest")}
            selected={draft.sortDirection === "desc"}
            accessibilityLabel={t("filters.sortLatest")}
            onPress={() => onChangeSort("desc")}
            className="flex-1"
          />
        </View>
      </View>

      <View className="flex-row gap-3">
        <Button
          title={t("filters.reset")}
          accessibilityLabel={t("filters.reset")}
          variant="secondary"
          onPress={onReset}
          fullWidth={false}
          className="flex-1"
        />
        <Button
          title={t("filters.apply")}
          accessibilityLabel={t("filters.apply")}
          onPress={onApply}
          fullWidth={false}
          className="flex-1"
        />
      </View>
    </BottomSheet>
  );
};
