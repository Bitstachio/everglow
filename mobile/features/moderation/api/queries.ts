import { useQuery } from "@tanstack/react-query";
import { photosControllerFindOne, reportsControllerListReports } from "@/lib/api/generated";
import { unwrapEnvelope } from "@/lib/api/envelope";
import { moderationKeys } from "./keys";
import type { ReportResponseDto, ReportStatus } from "../types";

/** The most the API returns in one page. */
const REPORT_PAGE_SIZE = 100;
/** Enough for a roll's week of decisions; the list is newest first. */
const MAX_RECENT_REPORT_PAGES = 5;

/** The frame a report is about, for its print at the top of the ticket. */
export const useReportedPhotoQuery = (photoId: string | undefined, enabled = true) =>
  useQuery({
    queryKey: moderationKeys.photo(photoId ?? ""),
    enabled: Boolean(photoId) && enabled,
    // Once reported it's hidden from the reporter, and a refetch would only 404.
    staleTime: Infinity,
    queryFn: async ({ signal }) => {
      const { data } = await photosControllerFindOne({ path: { photoId: photoId! }, signal, throwOnError: true });
      return unwrapEnvelope(data);
    },
  });

/** Reads pages of a roll's reports, newest first, until the last page or `maxPages`. */
const listReports = async (
  eventId: string,
  { status, maxPages, signal }: { status?: ReportStatus; maxPages: number; signal: AbortSignal },
): Promise<ReportResponseDto[]> => {
  const reports: ReportResponseDto[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < maxPages; page++) {
    const { data } = await reportsControllerListReports({
      path: { eventId },
      query: { limit: REPORT_PAGE_SIZE, ...(status ? { status } : {}), ...(cursor ? { cursor } : {}) },
      signal,
      throwOnError: true,
    });
    const { items, nextCursor } = unwrapEnvelope(data);
    reports.push(...items);
    if (!nextCursor) break;
    cursor = nextCursor;
  }
  return reports;
};

/**
 * Every open frame and person report on a roll, as its hosts see them: what
 * 10.8 lists and 10.9 decides. All pages load, so no open report is dropped.
 * Reporters are never in them.
 */
export const useEventOpenReportsQuery = (eventId: string | undefined, enabled = true) =>
  useQuery({
    queryKey: moderationKeys.reports(eventId ?? "", "OPEN"),
    enabled: Boolean(eventId) && enabled,
    queryFn: ({ signal }) => listReports(eventId!, { status: "OPEN", maxPages: Infinity, signal }),
  });

/**
 * A roll's latest reports of every status, for "Done · N this week" (10.8).
 * Capped: it only counts recent decisions, and the open ones have their own query.
 */
export const useEventRecentReportsQuery = (eventId: string | undefined, enabled = true) =>
  useQuery({
    queryKey: moderationKeys.reports(eventId ?? ""),
    enabled: Boolean(eventId) && enabled,
    queryFn: ({ signal }) => listReports(eventId!, { maxPages: MAX_RECENT_REPORT_PAGES, signal }),
  });
