import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  blocksControllerBlock,
  reportsControllerReportEvent,
  reportsControllerReportMember,
  reportsControllerReportPhoto,
} from "@/lib/api/generated";
import { unwrapEnvelope } from "@/lib/api/envelope";
import { eventsKeys } from "@/features/events/api/keys";
import { profileKeys } from "@/features/profile/api/keys";
import type { ReportTarget } from "../lib/reasons";
import type { ReportReason, ReportResponseDto } from "../types";

export type ReportRequest = {
  eventId: string;
  target: ReportTarget;
  /** The frame, for a frame report. */
  photoId?: string;
  /** The person, for a person report. */
  userId?: string;
  reason: ReportReason;
  note?: string;
};

const fileReport = async ({ eventId, target, photoId, userId, reason, note }: ReportRequest) => {
  const body = { reason, ...(note ? { note } : {}) };
  if (target === "frame") {
    if (!photoId) throw new Error("A frame report needs its photo");
    const { data } = await reportsControllerReportPhoto({ path: { photoId }, body, throwOnError: true });
    return unwrapEnvelope(data);
  }
  if (target === "person") {
    if (!userId) throw new Error("A person report needs its person");
    const { data } = await reportsControllerReportMember({
      path: { eventId, targetUserId: userId },
      body,
      throwOnError: true,
    });
    return unwrapEnvelope(data);
  }
  const { data } = await reportsControllerReportEvent({ path: { eventId }, body, throwOnError: true });
  return unwrapEnvelope(data);
};

/**
 * File a report (10.1–10.6). A repeat while the first is open returns that
 * one. A reported frame is hidden from its reporter at once, and a reported
 * roll can lose its cover, so the roll, its frames and its people are read again.
 */
export const useReportMutation = () => {
  const queryClient = useQueryClient();

  return useMutation<ReportResponseDto, Error, ReportRequest>({
    mutationFn: fileReport,
    onSuccess: async (_report, { eventId }) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: eventsKeys.detail(eventId) }),
        queryClient.invalidateQueries({ queryKey: eventsKeys.photos(eventId) }),
        queryClient.invalidateQueries({ queryKey: eventsKeys.participants(eventId) }),
        queryClient.invalidateQueries({ queryKey: eventsKeys.all }),
      ]);
    },
  });
};

/** Every roll's frames and roll call, whichever roll: a block hides photos both ways and marks the roll call. */
const QUERIES_AFTER_BLOCK = [
  [{ _id: "photosControllerListPhotos" }],
  [{ _id: "eventsControllerGetParticipants" }],
  [{ _id: "eventsControllerFindOne" }],
  eventsKeys.all,
  profileKeys.blocks(),
];

/** Block someone (10.11). Silent and idempotent: blocking twice keeps the first block. */
export const useBlockMutation = () => {
  const queryClient = useQueryClient();

  return useMutation<void, Error, string>({
    mutationFn: async (userId) => {
      await blocksControllerBlock({ path: { userId }, throwOnError: true });
    },
    onSuccess: async () => {
      await Promise.all(QUERIES_AFTER_BLOCK.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
    },
  });
};
