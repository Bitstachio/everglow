import { frameNumbers } from "@/features/moderation/lib/report-groups";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { usePersonFramesQuery } from "../api/gallery";
import { useEventParticipantsQuery, useEventPhotosQuery, useEventQuery } from "../api/queries";
import { firstName, rollShowsFrames } from "../lib/roll-page";
import type { PhotoResponseDto } from "../types";

/** A frame of theirs, with its number on the whole roll. */
export type PersonFrame = { photo: PhotoResponseDto; number: number };

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/**
 * Someone's frames, opened from their row on the roll call. The frames come
 * filtered by the API; their numbers are their places on the whole roll, so
 * the whole roll is read too, as the reports screens do.
 */
export const usePersonFramesScreen = () => {
  const { t } = useTranslation("roll");
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string; userId: string }>();
  const eventId = first(params.id) ?? "";
  const userId = first(params.userId) ?? "";

  const eventQuery = useEventQuery(eventId || undefined);
  const participantsQuery = useEventParticipantsQuery(eventId || undefined);
  const event = eventQuery.data ?? null;
  const showsFrames = rollShowsFrames(event);
  const framesQuery = usePersonFramesQuery(eventId, userId, Boolean(eventId && userId) && showsFrames);
  const rollQuery = useEventPhotosQuery(eventId || undefined, showsFrames);

  const person = (participantsQuery.data ?? []).find((participant) => participant.userId === userId);
  const name = person?.name || t("people.unknown");

  // Each frame once: pages can shift as frames are added.
  const listed = new Map<string, PhotoResponseDto>(
    (framesQuery.data?.pages ?? []).flatMap((page) => page.items.map((photo) => [photo.id, photo] as const)),
  );
  const numbers = frameNumbers((rollQuery.data ?? []).map((photo) => photo.id));
  // A frame added since the whole roll was read has no number yet; it waits for the next read.
  const frames: PersonFrame[] = [...listed.values()].flatMap((photo) => {
    const number = numbers.get(photo.id);
    return number === undefined ? [] : [{ photo, number }];
  });

  const isLoading =
    eventQuery.isLoading ||
    participantsQuery.isLoading ||
    (showsFrames && (framesQuery.isLoading || rollQuery.isLoading));
  const isError = !isLoading && (eventQuery.isError || framesQuery.isError || rollQuery.isError);

  return {
    name,
    firstName: firstName(name),
    frames,
    showsFrames,
    isLoading,
    isError,
    hasMore: framesQuery.hasNextPage,
    loadMore: () => {
      if (framesQuery.hasNextPage && !framesQuery.isFetchingNextPage) void framesQuery.fetchNextPage();
    },
    refreshing: framesQuery.isRefetching || rollQuery.isRefetching,
    onRefresh: () => {
      void eventQuery.refetch();
      void framesQuery.refetch();
      void rollQuery.refetch();
    },
    onRetry: () => {
      if (eventQuery.isError) void eventQuery.refetch();
      if (framesQuery.isError) void framesQuery.refetch();
      if (rollQuery.isError) void rollQuery.refetch();
    },
    onBack: () =>
      router.canGoBack() ? router.back() : router.replace({ pathname: "/events/[id]/people", params: { id: eventId } }),
  };
};
