import { developingFrames, summarizeTray } from "../lib/upload-tray-view";
import { useAuth } from "@/context/auth-context";
import { getErrorMessage } from "@/lib/api/errors";
import * as ImagePicker from "expo-image-picker";
import { File, Paths } from "expo-file-system";
import * as MediaLibrary from "expo-media-library";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert } from "react-native";
import {
  useDeactivateEventMutation,
  useDeleteEventPhotoMutation,
  useLeaveEventMutation,
  useRefreshRollAfterUpload,
  useRemoveEventParticipantMutation,
} from "../api/mutations";
import type { EventPhotoFile } from "../api/upload-event-photos";
import { useEventParticipantsQuery, useEventPhotosQuery, useEventQuery } from "../api/queries";
import { retainUploadFiles, releaseUploadFile } from "../lib/upload-tray-storage";
import { roomShortfall, toTrayItems, type PickedFile, type RoomShortfall } from "../lib/picked-photos";
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
import {
  addToTray,
  dismissClosed,
  localFileFor,
  reconcileTrayPhotos,
  ownsUploadTrays,
  releaseLocalFile,
  retryTray,
  useUploadTray,
  type TrayItem,
} from "../lib/upload-tray";
import type { EventParticipantResponseDto, PhotoResponseDto } from "../types";
import { eventStorageLeftBytes } from "../utils";
import { useArrivalNote } from "./use-arrival-note";

// 08.1: event photos upload as picked: no crop step and no re-encode, so group
// shots and portraits keep their original aspect ratio. Only avatars and covers
// crop. A selectionLimit of 0 allows as many as the platform's picker does; the
// tray sends them 20 at a time, and the room check bounds a selection.
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

/** Saves one frame to the phone's library. The library keeps its own copy, so the download goes. */
const saveToLibrary = async (photo: PhotoResponseDto) => {
  // Original S3 keys have no suffix. Photos detects the media type from the local filename.
  const extensions: Record<PhotoResponseDto["contentType"], string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/heic": "heic",
    "image/heif": "heif",
  };
  const destination = new File(Paths.cache, `everglow-${photo.id}.${extensions[photo.contentType]}`);
  const downloaded = await File.downloadFileAsync(photo.url, destination, { idempotent: true });
  try {
    await MediaLibrary.Asset.create(downloaded.uri);
  } finally {
    try {
      downloaded.delete();
    } catch {
      // Already gone; the cache is the system's to clear anyway.
    }
  }
};

/** What the sheet over the roll shows: the menu, people, or a slip. */
export type RollSheet = "menu" | "people" | "leave" | "cut" | "remove" | "room" | "closedSending";

/** 08.6: picked photos that don't all fit, waiting on Send or Pick again. */
type RoomCheck = RoomShortfall & { items: TrayItem[]; leftBytes: number };

/** How long a result stays in the footer. */
const NOTICE_MS = 4000;

/** 07.1–07.11: the roll, through its whole life, for each role. */
export const useEventDetailScreen = () => {
  const { t } = useTranslation("roll");
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const eventId = Array.isArray(id) ? id[0] : id;
  const { user } = useAuth();
  const [leavingRoll, setLeavingRoll] = useState(false);

  const eventQuery = useEventQuery(eventId, !leavingRoll);
  const event = eventQuery.data ?? null;
  // A suspended roll's photos are hidden, and upcoming or closed rolls have none.
  const hasPhotos = event !== null && event.status !== "SUSPENDED" && event.galleryState === "OPEN";
  const photosQuery = useEventPhotosQuery(eventId, hasPhotos && !leavingRoll);
  const participantsQuery = useEventParticipantsQuery(eventId, !leavingRoll);

  const leaveEventMutation = useLeaveEventMutation();
  const deactivateMutation = useDeactivateEventMutation();
  const removeParticipantMutation = useRemoveEventParticipantMutation(eventId ?? "");
  const refreshRoll = useRefreshRollAfterUpload();
  const tray = useUploadTray(eventId);
  const deletePhotoMutation = useDeleteEventPhotoMutation();
  // After joining, or opening an envelope you're already on (06.6, 06.7).
  const arrivalNote = useArrivalNote();

  // When this device last looked, read once: the ticks stay for this visit.
  const [lastVisit] = useState(() => (eventId && user ? readLastVisit(user.id, eventId) : null));
  const [openedDismissed, setOpenedDismissed] = useState(false);
  const [now, setNow] = useState(() => new Date());

  // From the moment the picker closes until its photos are in the tray: iOS
  // copies every selected photo into the app first, which takes a while.
  const [preparing, setPreparing] = useState(false);
  const [roomCheck, setRoomCheck] = useState<RoomCheck | null>(null);
  const [saving, setSaving] = useState<{ done: number; total: number } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [openFrame, setOpenFrame] = useState<SheetFrame | null>(null);
  const [isSavingFrame, setIsSavingFrame] = useState(false);
  const [confirmDeleteVisible, setConfirmDeleteVisible] = useState(false);

  // One sheet over the roll whose content changes, so one modal never opens
  // from another: iOS drops a modal presented while another is closing.
  const [sheet, setSheet] = useState<RollSheet | null>(null);
  const [removing, setRemoving] = useState<EventParticipantResponseDto | null>(null);
  // What waits for the sheet to be fully gone: the library picker can't open over it.
  const afterSheetCloses = useRef<(() => void) | null>(null);
  const closeSheet = () => setSheet(null);

  const photos = hasPhotos ? (photosQuery.data ?? []) : [];
  useEffect(() => {
    if (eventId && hasPhotos && photosQuery.data) reconcileTrayPhotos(eventId, photosQuery.data);
  }, [eventId, hasPhotos, photosQuery.data]);
  const participants = participantsQuery.data ?? [];
  const role = event ? rollRole(event, participants, user?.id) : "viewer";
  const frames = sheetFrames(photos, participants, user?.id, lastVisit, t("frame.you"));
  const developing = hasPhotos ? developingFrames(tray.items, photos, frames.length) : [];
  const stage = event ? rollStage(event, photos.length + developing.length) : "open";
  const leftBytes = event ? eventStorageLeftBytes(event) : null;
  const isFull = leftBytes !== null && leftBytes <= 0 && (stage === "open" || stage === "empty");

  const isLoading = eventQuery.isLoading || participantsQuery.isLoading || (hasPhotos && photosQuery.isLoading);
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

  const openTray = () => {
    if (eventId) router.push(`/events/${eventId}/tray`);
  };

  /** Puts the photos in the tray and starts them developing. 08.5 opens the tray to say why some can't go. */
  const sendToTray = async (items: TrayItem[]) => {
    if (!eventId || !user || items.length === 0) return;
    const retained = await retainUploadFiles(user.id, items);
    if (!ownsUploadTrays(user.id)) {
      retained.forEach((item) => releaseUploadFile(user.id, item.uri));
      return;
    }
    addToTray(eventId, retained, () => refreshRoll(eventId));
    if (items.some((item) => item.status.kind === "rejected")) openTray();
  };

  const onAddPhotos = async () => {
    if (!eventId) return;

    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        showNotice(t("result.photosAccess"));
        return;
      }

      setPreparing(true);
      const result = await ImagePicker.launchImageLibraryAsync(PICKER_OPTIONS);
      if (result.canceled || !result.assets?.length) return;

      const picked: PickedFile[] = result.assets
        .map((asset) => ({
          uri: asset.uri,
          contentType: photoContentType(asset),
          sizeBytes: photoSizeBytes(asset),
          fileName: asset.fileName ?? null,
          isVideo: asset.type === "video",
        }))
        // A file that can't be measured can't be signed for, so it's left out.
        .filter((file) => file.sizeBytes > 0);
      const items = toTrayItems(picked, (index) => t("tray.fallbackName", { number: index + 1 }));

      const shortfall = roomShortfall(items, leftBytes);
      if (shortfall && leftBytes !== null) {
        setRoomCheck({ ...shortfall, items, leftBytes });
        setSheet("room");
        return;
      }
      await sendToTray(items);
    } catch (error) {
      showNotice(getErrorMessage(error, t("result.didntTake")));
    } finally {
      setPreparing(false);
    }
  };

  /** 08.6 "Send 3": the smallest that fit go; the rest are dropped, and anything rejected still says why. */
  const onSendWhatFits = () => {
    if (!roomCheck) return;
    const fits = new Set(roomCheck.fits.map((item) => item.key));
    closeSheet();
    void sendToTray(roomCheck.items.filter((item) => fits.has(item.key) || item.status.kind === "rejected")).catch(
      (error) => showNotice(getErrorMessage(error, t("result.didntTake"))),
    );
    setRoomCheck(null);
  };

  const onPickAgain = () => {
    closeSheet();
    setRoomCheck(null);
    afterSheetCloses.current = () => void onAddPhotos();
  };

  const onSheetClosed = () => {
    const next = afterSheetCloses.current;
    afterSheetCloses.current = null;
    next?.();
  };

  const ensureLibraryAccess = async () => {
    const { status } = await MediaLibrary.requestPermissionsAsync();
    if (status === "granted") return true;
    showNotice(t("result.libraryAccess"));
    return false;
  };

  const onSaveAll = async () => {
    if (photos.length === 0 || saving) return;
    if (!(await ensureLibraryAccess())) return;

    const total = photos.length;
    let saved = 0;
    setSaving({ done: 0, total });
    for (const photo of photos) {
      try {
        await saveToLibrary(photo);
        saved += 1;
      } catch {
        // Keep going: one frame that won't save shouldn't stop the rest.
      }
      setSaving({ done: saved, total });
    }
    setSaving(null);

    if (saved === total) showNotice(t("result.saved", { count: total }));
    else if (saved === 0) showNotice(t("result.saveFailed"));
    else showNotice(t("result.savedSome", { saved, total }));
  };

  const onSaveFrame = async () => {
    if (!openFrame) return;
    if (!(await ensureLibraryAccess())) return;
    setIsSavingFrame(true);
    try {
      await saveToLibrary(openFrame.photo);
      showNotice(t("result.saved", { count: 1 }));
    } catch {
      showNotice(t("result.saveFailed"));
    } finally {
      setIsSavingFrame(false);
    }
  };

  const onRetryFrame = async () => {
    if (!openFrame || !hasPhotos) throw new Error("No visible frame to retry");
    const photoId = openFrame.photo.id;
    const result = await photosQuery.refetch({ throwOnError: true });
    const photo = result.data?.find((item) => item.id === photoId);
    if (!photo) throw new Error("Frame is no longer available");
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
    // Stop active readers before membership is revoked and their caches are evicted.
    setLeavingRoll(true);
    leaveEventMutation.mutate(eventId, {
      onSuccess: () => {
        closeSheet();
        router.replace("/events");
      },
      onError: (error) => {
        closeSheet();
        setLeavingRoll(false);
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

  // 08.8 takes the sheet once nothing else is on it: one sheet, so iOS never drops it.
  const closedWhileSending = tray.closed && !tray.running ? tray.closed : null;
  const shownSheet: RollSheet | null = sheet ?? (closedWhileSending ? "closedSending" : null);
  const onDismissClosed = () => {
    if (eventId) dismissClosed(eventId);
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
    developing,
    localFileFor,
    onPreviewReady: releaseLocalFile,
    tray: summarizeTray(tray),
    trayRunning: tray.running,
    closedWhileSending,
    isFull,
    leftBytes,
    roomCheck,
    preparing,
    saving,
    notice: tray.storageError ? t("result.localStorage") : notice,
    openedVisible,
    openFrame,
    openFrameIsDeletable,
    isSavingFrame,
    isDeletingFrame: deletePhotoMutation.isPending,
    confirmDeleteVisible,
    sheet: shownSheet,
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
    onOpenTray: openTray,
    onRetry: () => {
      if (eventId) retryTray(eventId);
    },
    onSendWhatFits,
    onPickAgain,
    onDismissClosed,
    onSaveAll: () => void onSaveAll(),
    onOpenFrame: setOpenFrame,
    onCloseFrame: () => setOpenFrame(null),
    onRetryFrame,
    onSaveFrame: () => void onSaveFrame(),
    onDeleteFrame: () => setConfirmDeleteVisible(true),
    onCancelDeleteFrame: () => setConfirmDeleteVisible(false),
    onConfirmDeleteFrame,
    onOpenMenu: () => setSheet("menu"),
    onCloseSheet: shownSheet === "closedSending" ? onDismissClosed : closeSheet,
    onSheetClosed,
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
