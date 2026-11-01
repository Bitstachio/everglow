import { useQuery } from "@tanstack/react-query";
import { photosControllerFindOne, reportsControllerListReports } from "@/lib/api/generated";
import { unwrapEnvelope } from "@/lib/api/envelope";
import { moderationKeys } from "./keys";
import type { ReportResponseDto } from "../types";

/** The most the API returns in one page. */
const REPORT_PAGE_SIZE = 100;
/** Enough for any roll's week of reports; the list is newest first. */
const MAX_REPORT_PAGES = 5;

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

/**
 * A roll's frame and person reports as its hosts see them, every status,
 * newest first (10.8). Reporters are never in them.
 */
export const useEventReportsQuery = (eventId: string | undefined, enabled = true) =>
  useQuery({
    queryKey: moderationKeys.reports(eventId ?? ""),
    enabled: Boolean(eventId) && enabled,
    queryFn: async ({ signal }): Promise<ReportResponseDto[]> => {
      const reports: ReportResponseDto[] = [];
      let cursor: string | undefined;
      for (let page = 0; page < MAX_REPORT_PAGES; page++) {
        const { data } = await reportsControllerListReports({
          path: { eventId: eventId! },
          query: { limit: REPORT_PAGE_SIZE, ...(cursor ? { cursor } : {}) },
          signal,
          throwOnError: true,
        });
        const { items, nextCursor } = unwrapEnvelope(data);
        reports.push(...items);
        if (!nextCursor) break;
        cursor = nextCursor;
      }
      return reports;
    },
  });
