import {
  photosControllerFindOneQueryKey,
  reportsControllerListReportsQueryKey,
} from "@/lib/api/generated/@tanstack/react-query.gen";
import type { ReportStatus } from "../types";

export const moderationKeys = {
  photo: (photoId: string) => photosControllerFindOneQueryKey({ path: { photoId } }),
  /** A roll's reports, as its hosts see them. Every status when `status` is left out. */
  reports: (eventId: string, status?: ReportStatus) =>
    reportsControllerListReportsQueryKey({ path: { eventId }, ...(status ? { query: { status } } : {}) }),
};
