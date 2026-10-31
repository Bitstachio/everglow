import { useAuth } from "@/context/auth-context";
import { getErrorMessage } from "@/lib/api/errors";
import * as ImagePicker from "expo-image-picker";
import { File } from "expo-file-system";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert } from "react-native";
import {
  useDeactivateEventMutation,
  useDeleteEventPhotoMutation,
  useLeaveEventMutation,
  useRemoveEventParticipantMutation,
  useUploadEventPhotosMutation,
} from "../api/mutations";
import { requestLibraryAddAccess, saveEventPhoto } from "../api/save-event-photos";
import type { EventPhotoFile } from "../api/upload-event-photos";
import { useEventParticipantsQuery, useEventPhotosQuery, useEventQuery, useRenewEventPhoto } from "../api/queries";
import {
  hasOpened,
  isRollLastDay,
  rollRole,
  rollStage,
  sheetFrames,
  shouldShowOpened,
  type SheetFrame,
} from "../lib/roll-page";
import { hasClosed } from "../lib/rolls";
import { readLastVisit, writeLastVisit } from "../lib/roll-visits";
import { useArrivalNote } from "./use-arrival-note";
import type { EventParticipantResponseDto, EventResponseDto, PhotoResponseDto, PhotoUploadStatus } from "../types";
import { eventStorageLeftBytes, formatStorageBytes } from "../utils";

/** What the roll's page shows, read from its three queries. */
type RollOnScreen = {
  event: EventResponseDto;
  photos: PhotoResponseDto[];
  participants: EventParticipantResponseDto[];
};

// Event photos upload as picked: no crop step and no re-encode, so group shots
// and portraits keep their original aspect ratio. Only avatars and covers crop.
// A selectionLimit of 0 allows as many as the platform's picker does; the
// storage check before uploading is what bounds a selection.
const PICKER_OPTIONS: ImagePicker.ImagePickerOptions = {
  mediaTypes: ["images"],
  quality: 1,
  allowsMultipleSelection: true,
  selectionLimit: 0,
};

type PhotoContentType = EventPhotoFile["contentType"];

const MIME_TYPES_BY_EXTENSION: Record<string, PhotoContentType> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
};

const PHOTO_CONTENT_TYPES = new Set<string>(Object.values(MIME_TYPES_BY_EXTENSION));

const isPhotoContentType = (value: string): value is PhotoContentType => PHOTO_CONTENT_TYPES.has(value);

/**
 * The picker's own mimeType when it reports one. Otherwise the file extension,
 * case-insensitively: iOS names camera-roll files `IMG_0001.HEIC`. Anything the
 * API does not list is sent as JPEG.
 */
const photoContentType = (asset: ImagePicker.ImagePickerAsset): PhotoContentType => {
  const extension = asset.uri.split(".").pop()?.toLowerCase() ?? "";
  const reported = asset.mimeType?.toLowerCase() ?? MIME_TYPES_BY_EXTENSION[extension];
  return reported && isPhotoContentType(reported) ? reported : "image/jpeg";
};

/**
 * The file's length on disk, which is what gets uploaded. The picker's
 * fileSize is the fallback; the upload checks the real bytes against it again.
 */
const photoSizeBytes = (asset: ImagePicker.ImagePickerAsset): number => {
  try {
    const size = new File(asset.uri).size;
    if (size > 0) return size;
  } catch {
    // Not a file:// URI the file system can stat.
  }
  return asset.fileSize ?? 0;
};

/** What the sheet over the roll shows: the menu, people, or a slip. */
export type RollSheet = "menu" | "people" | "leave" | "cut" | "remove";

/** How long a result stays in the footer. */
const NOTICE_MS = 4000;

/** 07.1–07.11: the roll, through its whole life, for each role. */
export const useEventDetailScreen = () => {
  const { t } = useTranslation("roll");
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const eventId = Array.isArray(id) ? id[0] : id;
  const { user } = useAuth();
  // The roll as it was when Leave was confirmed. Leaving evicts its caches
  // before the screen is replaced, so it keeps showing this until then
  // instead of falling back to the loading spinner.
  const [leftRoll, setLeftRoll] = useState<RollOnScreen | null>(null);
  const leavingRoll = leftRoll !== null;

  const eventQuery = useEventQuery(eventId, !leavingRoll);
  const event = leftRoll?.event ?? eventQuery.data ?? null;
  // A suspended roll's photos are hidden, and upcoming or closed rolls have none.
  const hasPhotos = event !== null && event.status !== "SUSPENDED" && event.galleryState === "OPEN";
  const photosQuery = useEventPhotosQuery(eventId, hasPhotos && !leavingRoll);
  const participantsQuery = useEventParticipantsQuery(eventId, !leavingRoll);
  const renewPhoto = useRenewEventPhoto(eventId);

  const leaveEventMutation = useLeaveEventMutation();
  const deactivateMutation = useDeactivateEventMutation();
  const removeParticipantMutation = useRemoveEventParticipantMutation(eventId ?? "");
  const uploadPhotosMutation = useUploadEventPhotosMutation();
  const deletePhotoMutation = useDeleteEventPhotoMutation();
  // After joining, or opening an envelope you're already on (06.6, 06.7).
  const arrivalNote = useArrivalNote();

  // When this device last looked, read once: the ticks stay for this visit.
  const [lastVisit] = useState(() => (eventId && user ? readLastVisit(user.id, eventId) : null));
  const [openedDismissed, setOpenedDismissed] = useState(false);
  const [now, setNow] = useState(() => new Date());

  const [uploadStatus, setUploadStatus] = useState<PhotoUploadStatus | null>(null);
  const [saving, setSaving] = useState<{ done: number; total: number } | null>(null);
  // One save at a time, Save all or the viewer's, so the two never work on the same frame at once.
  const saveRunning = useRef(false);
  // Frames a Save all that didn't finish did save. The next Save all skips them, so nothing lands twice.
  const savedByLastSaveAll = useRef(new Set<string>());
  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [openFrame, setOpenFrame] = useState<SheetFrame | null>(null);
  const [isSavingFrame, setIsSavingFrame] = useState(false);
  const [confirmDeleteVisible, setConfirmDeleteVisible] = useState(false);

  // One sheet over the roll whose content changes, so one modal never opens
  // from another: iOS drops a modal presented while another is closing.
  const [sheet, setSheet] = useState<RollSheet | null>(null);
  const [removing, setRemoving] = useState<EventParticipantResponseDto | null>(null);
  const closeSheet = () => setSheet(null);

  const photos = leftRoll?.photos ?? (hasPhotos ? (photosQuery.data ?? []) : []);
  const participants = leftRoll?.participants ?? participantsQuery.data ?? [];
  const role = event ? rollRole(event, participants, user?.id) : "viewer";
  const stage = event ? rollStage(event, photos.length) : "open";
  const frames = sheetFrames(photos, participants, user?.id, lastVisit, t("frame.you"));

  const isLoading =
    !leavingRoll && (eventQuery.isLoading || participantsQuery.isLoading || (hasPhotos && photosQuery.isLoading));
  const refreshing = eventQuery.isRefetching || photosQuery.isRefetching || participantsQuery.isRefetching;

  useEffect(() => {
    if (eventId && user?.id) writeLastVisit(user.id, eventId);
  }, [eventId, user?.id]);

  // The time left counts down while the roll is on screen.
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60 * 1000);
    return () => clearInterval(timer);
  }, []);

  // A roll that opens or closes while it's on screen is fetched again, so it moves on to its next stage.
  const turned = event !== null && (hasOpened(event, now) || hasClosed(event, now));
  const refetchEvent = eventQuery.refetch;
  useEffect(() => {
    if (turned) void refetchEvent({ cancelRefetch: false });
  }, [turned, refetchEvent]);

  useEffect(
    () => () => {
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
    },
    [],
  );

  useEffect(() => {
    if (!eventQuery.isError) return;
    Alert.alert(t("loadFailed"), getErrorMessage(eventQuery.error));
    router.back();
  }, [eventQuery.isError, eventQuery.errorUpdatedAt, eventQuery.error, router, t]);

  const showNotice = (message: string) => {
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    setNotice(message);
    noticeTimer.current = setTimeout(() => setNotice(null), NOTICE_MS);
  };

  const onRefresh = () => {
    setNow(new Date());
    void Promise.all([
      eventQuery.refetch(),
      participantsQuery.refetch(),
      ...(hasPhotos ? [photosQuery.refetch()] : []),
    ]);
  };

  const onBack = () => (router.canGoBack() ? router.back() : router.replace("/events"));

  const onAddPhotos = async () => {
    if (!eventId) return;

    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        showNotice(t("result.photosAccess"));
        return;
      }

      // Set before the picker opens: once the member taps Add, iOS copies every
      // selected photo into the app before the picker returns, which takes
      // seconds for a large selection. The shutter shows it from the moment the
      // picker closes.
      setUploadStatus({ phase: "preparing" });
      const result = await ImagePicker.launchImageLibraryAsync(PICKER_OPTIONS);
      if (result.canceled || !result.assets?.length) return;

      const total = result.assets.length;
      const files: EventPhotoFile[] = result.assets
        .map((asset) => ({ uri: asset.uri, contentType: photoContentType(asset), sizeBytes: photoSizeBytes(asset) }))
        .filter((file) => file.sizeBytes > 0);

      const selectedBytes = files.reduce((sum, file) => sum + file.sizeBytes, 0);
      const storageLeft = event ? eventStorageLeftBytes(event) : null;
      if (storageLeft !== null && selectedBytes > storageLeft) {
        showNotice(
          t("result.noRoom", { needed: formatStorageBytes(selectedBytes), left: formatStorageBytes(storageLeft) }),
        );
        return;
      }

      setUploadStatus({ phase: "uploading", done: 0, total });
      const { uploaded, error } = await uploadPhotosMutation.mutateAsync({
        eventId,
        files,
        // Files that could not be measured were never sent, so they count as done.
        onProgress: ({ done }) => setUploadStatus({ phase: "uploading", done: done + total - files.length, total }),
      });

      if (error && uploaded === 0) {
        showNotice(getErrorMessage(error, t("result.didntTake")));
      } else if (uploaded === total) {
        showNotice(t("result.developed", { count: total }));
      } else if (uploaded === 0) {
        showNotice(t("result.didntTake"));
      } else {
        showNotice(t("result.developedSome", { done: uploaded, total }));
      }
    } catch (error) {
      showNotice(getErrorMessage(error, t("result.didntTake")));
    } finally {
      setUploadStatus(null);
    }
  };

  const ensureLibraryAccess = async () => {
    if (await requestLibraryAddAccess()) return true;
    showNotice(t("result.libraryAccess"));
    return false;
  };

  const onSaveAll = async () => {
    if (photos.length === 0 || saveRunning.current) return;
    saveRunning.current = true;
    try {
      if (!(await ensureLibraryAccess())) return;

      // Trying again after a Save all that didn't finish saves only what it missed.
      const saved = savedByLastSaveAll.current;
      const missed = photos.filter((photo) => !saved.has(photo.id));
      const pending = missed.length > 0 ? missed : photos;
      const signedAt = photosQuery.dataUpdatedAt;
      const total = pending.length;
      let done = 0;
      setSaving({ done: 0, total });
      for (const photo of pending) {
        try {
          await saveEventPhoto(photo, signedAt);
          saved.add(photo.id);
          done += 1;
        } catch {
          // Keep going: one frame that won't save shouldn't stop the rest.
        }
        setSaving({ done, total });
      }

      if (done === total) {
        // Everything is in Photos, so a later Save all starts over.
        saved.clear();
        showNotice(t("result.saved", { count: total }));
      } else if (done === 0) {
        showNotice(t("result.saveFailed"));
      } else {
        showNotice(t("result.savedSome", { saved: done, total }));
      }
    } finally {
      setSaving(null);
      saveRunning.current = false;
    }
  };

  const onSaveFrame = async () => {
    if (!openFrame || saveRunning.current) return;
    const { photo } = openFrame;
    saveRunning.current = true;
    try {
      if (!(await ensureLibraryAccess())) return;
      setIsSavingFrame(true);
      await saveEventPhoto(photo, photosQuery.dataUpdatedAt);
      // Saved now, so trying a Save all that didn't finish again leaves it out.
      if (savedByLastSaveAll.current.size > 0) savedByLastSaveAll.current.add(photo.id);
      showNotice(t("result.saved", { count: 1 }));
    } catch {
      showNotice(t("result.saveFailed"));
    } finally {
      setIsSavingFrame(false);
      saveRunning.current = false;
    }
  };

  const onRetryFrame = async () => {
    if (!openFrame || !hasPhotos) throw new Error("No visible frame to retry");
    const photoId = openFrame.photo.id;
    // Only this frame's link: a long roll's pages aren't all fetched again. A frame that's gone answers 404.
    const photo = await renewPhoto(photoId);
    // A request finishing after Close must not reopen the viewer or replace another frame.
    setOpenFrame((current) => (current?.photo.id === photoId ? { ...current, photo } : current));
  };

  const onConfirmDeleteFrame = () => {
    if (!eventId || !openFrame) return;
    deletePhotoMutation.mutate(
      { eventId, photoId: openFrame.photo.id },
      {
        onSuccess: () => {
          setConfirmDeleteVisible(false);
          setOpenFrame(null);
          showNotice(t("result.deleted"));
        },
        onError: (error) => {
          setConfirmDeleteVisible(false);
          showNotice(getErrorMessage(error));
        },
      },
    );
  };

  const onConfirmLeave = () => {
    if (!eventId || !event || leavingRoll) return;
    // Stop active readers before membership is revoked and their caches are
    // evicted, and keep the roll on screen until Home replaces it.
    setLeftRoll({ event, photos, participants });
    leaveEventMutation.mutate(eventId, {
      onSuccess: () => {
        closeSheet();
        router.replace("/events");
      },
      onError: (error) => {
        closeSheet();
        setLeftRoll(null);
        showNotice(getErrorMessage(error));
      },
    });
  };

  const onConfirmCut = () => {
    if (!eventId) return;
    deactivateMutation.mutate(eventId, {
      onSuccess: () => {
        closeSheet();
        showNotice(t("result.cut"));
      },
      onError: (error) => {
        closeSheet();
        showNotice(getErrorMessage(error));
      },
    });
  };

  const onConfirmRemove = () => {
    if (!removing) return;
    const name = removing.name;
    removeParticipantMutation.mutate(removing.userId, {
      onSuccess: () => {
        closeSheet();
        showNotice(t("result.removed", { name }));
      },
      onError: (error) => {
        closeSheet();
        showNotice(getErrorMessage(error));
      },
    });
  };

  const openedVisible = !openedDismissed && event !== null && shouldShowOpened(event, lastVisit);
  const openFrameIsDeletable =
    openFrame !== null &&
    stage !== "underReview" &&
    (role === "host" || (openFrame.photo.addedById !== null && openFrame.photo.addedById === user?.id));

  return {
    event,
    participants,
    frames,
    role,
    stage,
    now,
    lastDay: event ? isRollLastDay(event, now) : false,
    isLoading,
    refreshing,
    currentUserId: user?.id,
    uploadStatus,
    saving,
    notice,
    openedVisible,
    openFrame,
    openFrameIsDeletable,
    isSavingFrame,
    // The viewer's Save waits while Save all runs, and Save all while the viewer saves.
    canSaveFrame: saving === null,
    canSaveAll: frames.length > 0 && !isSavingFrame && saving === null,
    isDeletingFrame: deletePhotoMutation.isPending,
    confirmDeleteVisible,
    sheet,
    arrivalNote,
    isLeaving: leaveEventMutation.isPending,
    isCutting: deactivateMutation.isPending,
    removing,
    isRemoving: removeParticipantMutation.isPending,
    onRefresh,
    onBack,
    onDismissOpened: () => setOpenedDismissed(true),
    onAddFirstPhotos: () => {
      setOpenedDismissed(true);
      void onAddPhotos();
    },
    onAddPhotos: () => void onAddPhotos(),
    onSaveAll: () => void onSaveAll(),
    onOpenFrame: setOpenFrame,
    onCloseFrame: () => setOpenFrame(null),
    onRetryFrame,
    onSaveFrame: () => void onSaveFrame(),
    onDeleteFrame: () => setConfirmDeleteVisible(true),
    onCancelDeleteFrame: () => setConfirmDeleteVisible(false),
    onConfirmDeleteFrame,
    onOpenMenu: () => setSheet("menu"),
    onCloseSheet: closeSheet,
    onOpenPeople: () => setSheet("people"),
    // 05: the host's envelope screen, from Send the envelope (07.1) and Invite (07.4–07.8).
    onOpenEnvelope: () => {
      if (eventId) router.push(`/events/${eventId}/envelope`);
    },
    onOpenSettings: () => {
      closeSheet();
      if (eventId) router.push(`/events/${eventId}/settings`);
    },
    onLeave: () => setSheet("leave"),
    onConfirmLeave,
    onCut: () => setSheet("cut"),
    onConfirmCut,
    onRemove: (participant: EventParticipantResponseDto) => {
      setRemoving(participant);
      setSheet("remove");
    },
    onBackToPeople: () => setSheet("people"),
    onConfirmRemove,
    onOpenRules: () => router.push("/terms-of-use"),
  };
};
