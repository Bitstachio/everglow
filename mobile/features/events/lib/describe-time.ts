import { formatDate, formatDateTime } from "@/lib/format-date";
import type { TFunction } from "i18next";
import type { RollTime } from "./rolls";

/** The timing line of an event, in the `home` copy. */
export const describeTime = (t: TFunction<"home">, descriptor: RollTime): string => {
  switch (descriptor.kind) {
    case "closingSoon":
      return t("time.left", { hours: descriptor.hours, minutes: descriptor.minutes });
    case "closesOn":
      return t("time.until", { date: formatDate(descriptor.iso) });
    case "open":
      return t("time.open");
    case "opensOn":
      return t("time.opensAt", { when: formatDateTime(descriptor.iso) });
    case "closedOn":
      return t("time.closedOn", { date: formatDate(descriptor.iso) });
  }
};
