import type { ReportReason, ReportResponseDto } from "../types";

/** Reasons that hide a photo from members after one report (docs/moderation.md §5, rule 3). */
const HIDES_AT_ONCE: readonly ReportReason[] = ["NUDITY_OR_SEXUAL", "VIOLENCE"];

/** Open reports that hide a photo from members: 3, or 2 on a roll of 3 people or fewer (§5, rule 2). */
export const hideThreshold = (memberCount: number) => (memberCount <= 3 ? 2 : 3);

/** Every open report about one frame or one person: what hosts decide on, once (10.8). */
export type ReportGroup = {
  key: string;
  kind: "frame" | "person";
  photoId: string | null;
  /** The uploader of the frame, or the person reported. */
  userId: string | null;
  reports: ReportResponseDto[];
  /** The reason given most, and how many gave it. */
  reason: ReportReason;
  reasonCount: number;
  /** Members no longer see the frame until someone decides. */
  hidden: boolean;
  /** Every report on it is with Everglow: hosts can only look (10.10). */
  withEverglow: boolean;
  /** The report a host's decision is sent on. It closes all the others with it. */
  actionable: ReportResponseDto | null;
  newestAt: string;
};

export const groupKey = (report: Pick<ReportResponseDto, "targetType" | "photoId" | "reportedUserId">) =>
  report.targetType === "PHOTO" ? `frame:${report.photoId}` : `person:${report.reportedUserId}`;

const topReason = (reports: ReportResponseDto[]) => {
  const counts = new Map<ReportReason, number>();
  for (const report of reports) counts.set(report.reason, (counts.get(report.reason) ?? 0) + 1);
  // Ties go to the more serious reason: one that hides at once.
  return [...counts.entries()].sort(
    ([a, countA], [b, countB]) =>
      countB - countA || Number(HIDES_AT_ONCE.includes(b)) - Number(HIDES_AT_ONCE.includes(a)),
  )[0];
};

/**
 * The open frame and person reports on a roll, one group per target, newest
 * first. Reports about the roll itself never reach hosts.
 */
export const groupOpenReports = (reports: ReportResponseDto[], memberCount: number): ReportGroup[] => {
  const groups = new Map<string, ReportResponseDto[]>();
  for (const report of reports) {
    if (report.status !== "OPEN" || report.targetType === "EVENT") continue;
    const key = groupKey(report);
    groups.set(key, [...(groups.get(key) ?? []), report]);
  }
  return [...groups.entries()]
    .map(([key, items]): ReportGroup => {
      const [reason, reasonCount] = topReason(items);
      const first = items[0];
      const isFrame = first.targetType === "PHOTO";
      return {
        key,
        kind: isFrame ? "frame" : "person",
        photoId: first.photoId,
        userId: first.reportedUserId,
        reports: items,
        reason,
        reasonCount,
        hidden:
          isFrame &&
          (items.length >= hideThreshold(memberCount) || items.some((item) => HIDES_AT_ONCE.includes(item.reason))),
        withEverglow: items.every((item) => item.queue === "PLATFORM"),
        actionable: items.find((item) => item.queue === "ORGANIZERS") ?? null,
        newestAt: items.reduce((newest, item) => (item.createdAt > newest ? item.createdAt : newest), first.createdAt),
      };
    })
    .sort((a, b) => b.newestAt.localeCompare(a.newestAt));
};

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Reports hosts or Everglow closed in the last seven days ("Done · 4 this week"). */
export const doneThisWeek = (reports: ReportResponseDto[], now: Date) =>
  reports.filter(
    (report) =>
      report.status !== "OPEN" &&
      report.resolvedAt !== null &&
      now.getTime() - new Date(report.resolvedAt).getTime() < WEEK_MS,
  ).length;

/** Frames are numbered by their place on the whole roll, newest first in the list, as the sheet numbers them. */
export const frameNumbers = (photoIds: string[]) => new Map(photoIds.map((id, index) => [id, photoIds.length - index]));
