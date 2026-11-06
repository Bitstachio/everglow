import type { ReportReason, ReportResponseDto } from "../types";

/**
 * The severe reasons hosts see (`SEVERE_REPORT_REASONS` in the API). One report
 * hides a photo from members (docs/moderation.md §5, rule 3), and a host's
 * dismissal hands it to Everglow instead of closing it (§3).
 */
export const SEVERE_REASONS: readonly ReportReason[] = ["NUDITY_OR_SEXUAL", "VIOLENCE"];

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
  /**
   * The reports still with the hosts. A decision is sent on one
   * of them and closes the others with it; the next is tried when the API
   * says this host filed the first (CANNOT_RESOLVE_OWN_REPORT).
   */
  decidable: ReportResponseDto[];
  newestAt: string;
};

/**
 * One frame or one person. A report whose frame was deleted (photoId null) or
 * whose person deleted their account (reportedUserId null) can't be matched
 * to the others any more, so it stands alone.
 */
export const groupKey = (report: Pick<ReportResponseDto, "id" | "targetType" | "photoId" | "reportedUserId">) => {
  if (report.targetType === "PHOTO" && report.photoId) return `frame:${report.photoId}`;
  if (report.targetType === "MEMBER" && report.reportedUserId) return `person:${report.reportedUserId}`;
  return `report:${report.id}`;
};

const topReason = (reports: ReportResponseDto[]) => {
  const counts = new Map<ReportReason, number>();
  for (const report of reports) counts.set(report.reason, (counts.get(report.reason) ?? 0) + 1);
  // Ties go to the more serious reason: one that hides at once.
  return [...counts.entries()].sort(
    ([a, countA], [b, countB]) =>
      countB - countA || Number(SEVERE_REASONS.includes(b)) - Number(SEVERE_REASONS.includes(a)),
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
          (items.length >= hideThreshold(memberCount) || items.some((item) => SEVERE_REASONS.includes(item.reason))),
        withEverglow: items.every((item) => item.queue === "PLATFORM"),
        decidable: items.filter((item) => item.queue === "ORGANIZERS"),
        newestAt: items.reduce((newest, item) => (item.createdAt > newest ? item.createdAt : newest), first.createdAt),
      };
    })
    .sort((a, b) => b.newestAt.localeCompare(a.newestAt));
};

/** The groups a host can still decide on: what "N to check" counts. Those with Everglow are listed, not counted. */
export const toCheckCount = (groups: ReportGroup[]) => groups.filter((group) => !group.withEverglow).length;

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
