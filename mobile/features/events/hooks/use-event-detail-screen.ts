import { useRollGallery } from "./use-roll-gallery";
import { useGalleryQuery, type SignedPhoto } from "../api/gallery";
import { developingFrames, summarizeTray } from "../lib/upload-tray-view";
import { useAuth } from "@/context/auth-context";
import { getErrorMessage, isApiError } from "@/lib/api/errors";
import * as ImagePicker from "expo-image-picker";
import { File } from "expo-file-system";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert } from "react-native";
import {
  useDeactivateEventMutation,
  useLeaveEventMutation,
  useRefreshRollAfterUpload,
  useRemoveEventParticipantMutation,
} from "../api/mutations";
import type { EventPhotoFile } from "../api/upload-event-photos";
import { useEventParticipantsQuery, useEventQuery } from "../api/queries";
import { retainUploadFiles, releaseUploadFile } from "../lib/upload-tray-storage";
import {
  roomShortfall,
  toTrayItems,
  trayPendingBytes,
  type PickedFile,
  type RoomShortfall,
} from "../lib/picked-photos";
import { hasOpened, isRollLastDay, rollRole, rollStage, sheetFrames, shouldShowOpened } from "../lib/roll-page";
import { hasClosed } from "../lib/rolls";
import { readLastVisit, writeLastVisit } from "../lib/roll-visits";
import {
  addToTray,
  dismissClosed,
  getTray,
  localFileFor,
  reconcileTrayPhotos,
  ownsUploadTrays,
  releaseLocalFile,
  useUploadTray,
  type TrayItem,
} from "../lib/upload-tray";
import type { EventParticipantResponseDto, EventResponseDto, PhotoResponseDto } from "../types";
import { eventStorageLeftBytes } from "../utils";
import { useArrivalNote } from "./use-arrival-note";
import { useBlockMutation } from "@/features/moderation/api/mutations";
import { useUnblockMutation } from "@/features/profile/api/mutations";
import type { SheetFrame } from "../lib/roll-page";

/** What the roll's page shows, read from its three queries. */
type RollOnScreen = {
  event: EventResponseDto;
  photos: PhotoResponseDto[];
  participants: EventParticipantResponseDto[];
};

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

/** What the sheet over the roll shows: the menu, people, or a slip. */
export type RollSheet = "menu" | "people" | "person" | "block" | "leave" | "cut" | "remove" | "room" | "closedSending";

/** Who is about to be blocked (10.11), and whether the slip is over the roll or the viewer. */
type BlockTarget = { userId: string; name: string; over: "roll" | "viewer" };

/** How a report hands back to the roll: `reported` once sent (10.4), `resume` to reopen the frame it left. */
const REPORTED = ["frame", "person", "roll"] as const;
type ReportReturn = { reported?: (typeof REPORTED)[number]; resume?: string };

/** 08.6: picked photos that don't all fit, waiting on Send or Pick again. */
type RoomCheck = RoomShortfall & { items: TrayItem[]; leftBytes: number };

/** How long a result stays in the footer. */
const NOTICE_MS = 4000;

/** 07.1–07.11: the roll, through its whole life, for each role. */
export const useEventDetailScreen = () => {
  const { t } = useTranslation(["roll", "report"]);
  const router = useRouter();
  const { id, reported, resume } = useLocalSearchParams<{ id: string } & ReportReturn>();
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
  const photosQuery = useGalleryQuery(eventId ?? "", hasPhotos && !leavingRoll);
  const participantsQuery = useEventParticipantsQuery(eventId, !leavingRoll);

  const leaveEventMutation = useLeaveEventMutation();
  const deactivateMutation = useDeactivateEventMutation();
  const removeParticipantMutation = useRemoveEventParticipantMutation(eventId ?? "");
  const refreshRoll = useRefreshRollAfterUpload();
  const tray = useUploadTray(eventId);
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
  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // One sheet over the roll whose content changes, so one modal never opens
  // from another: iOS drops a modal presented while another is closing.
  const [sheet, setSheet] = useState<RollSheet | null>(null);
  const [removing, setRemoving] = useState<EventParticipantResponseDto | null>(null);
  const [person, setPerson] = useState<EventParticipantResponseDto | null>(null);
  const [blockTarget, setBlockTarget] = useState<BlockTarget | null>(null);
  const [blockError, setBlockError] = useState<string | null>(null);
  const blockMutation = useBlockMutation();
  const unblockMutation = useUnblockMutation();
  // What waits for the sheet to be fully gone: the library picker can't open over it.
  const afterSheetCloses = useRef<(() => void) | null>(null);
  const closeSheet = () => setSheet(null);

  // Access taken away (403) or the roll gone (404): its frames go too.
  const photosRevoked = isApiError(photosQuery.error) && [403, 404].includes(photosQuery.error.status ?? 0);
  const pages = hasPhotos && !photosRevoked ? (photosQuery.data?.pages ?? []) : [];
  // Each frame once, with when its page's links were signed. Pages can shift
  // as frames are added, so the same frame can be listed twice.
  const listed = new Map<string, SignedPhoto>(
    pages.flatMap((page) => page.items.map((photo) => [photo.id, { photo, signedAt: page.signedAt }] as const)),
  );
  const photos = leftRoll?.photos ?? [...listed.values()].map((item) => item.photo);
  useEffect(() => {
    if (eventId && hasPhotos && photosQuery.data)
      reconcileTrayPhotos(
        eventId,
        photosQuery.data.pages.flatMap((page) => page.items),
      );
  }, [eventId, hasPhotos, photosQuery.data]);
  const participants = leftRoll?.participants ?? participantsQuery.data ?? [];
  const role = event ? rollRole(event, participants, user?.id) : "viewer";
  const frames = sheetFrames(photos, participants, user?.id, lastVisit, t("frame.you"));
  const developing = hasPhotos ? developingFrames(tray.items, photos, frames.length) : [];
  const stage = event ? rollStage(event, photos.length + developing.length) : "open";
  const leftBytes = event ? eventStorageLeftBytes(event) : null;
  const isFull = leftBytes !== null && leftBytes <= 0 && (stage === "open" || stage === "empty");

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
    if (items.some((item) => item.status.kind === "rejected" || item.status.kind === "failed")) openTray();
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

      const picked: PickedFile[] = result.assets.map((asset) => ({
        uri: asset.uri,
        contentType: photoContentType(asset),
        sizeBytes: photoSizeBytes(asset),
        fileName: asset.fileName ?? null,
        isVideo: asset.type === "video",
      }));
      const items = toTrayItems(picked, (index) => t("tray.fallbackName", { number: index + 1 }));

      // The tray as it is now that the picker has closed: photos still sending
      // take room the roll's numbers don't show yet.
      const roomLeft =
        leftBytes === null ? null : Math.max(0, leftBytes - trayPendingBytes(getTray(eventId).items, photos));
      const shortfall = roomShortfall(items, roomLeft);
      if (shortfall && roomLeft !== null) {
        setRoomCheck({ ...shortfall, items, leftBytes: roomLeft });
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

  // 08.8 takes the sheet once nothing else is on it: one sheet, so iOS never drops it.
  const closedWhileSending = tray.closed && !tray.running ? tray.closed : null;
  const shownSheet: RollSheet | null = sheet ?? (closedWhileSending ? "closedSending" : null);
  const onDismissClosed = () => {
    if (eventId) dismissClosed(eventId);
  };

  const openedVisible = !openedDismissed && event !== null && shouldShowOpened(event, lastVisit);
  const gallery = useRollGallery({
    eventId: eventId ?? "",
    userId: user?.id,
    // Leaving keeps the frames on screen until Home replaces the roll, but nothing can act on them.
    enabled: hasPhotos && !leavingRoll && !eventQuery.isError && !photosRevoked,
    canDeleteOthers: role === "host",
    canDelete: stage !== "underReview",
    frames,
    listed,
    showNotice,
  });

  // 10.4: a sent report says so on the roll for a few seconds, then the
  // param goes so coming back doesn't repeat it, as the arrival note does.
  const sentNotice = reported && REPORTED.includes(reported) ? t(`report:sent.${reported}`) : null;
  useEffect(() => {
    if (!reported) return;
    const timer = setTimeout(() => router.setParams({ reported: undefined }), NOTICE_MS);
    return () => clearTimeout(timer);
  }, [reported, router]);
  // A cancelled frame report reopens the frame it came from.
  const [resumed, setResumed] = useState<string | undefined>(undefined);
  if (resume !== resumed) {
    // Cleared again once handled, so the same frame can come back after another report.
    setResumed(resume);
    if (resume) gallery.onMoveFrame(resume);
  }
  useEffect(() => {
    if (resume) router.setParams({ resume: undefined });
  }, [resume, router]);

  const openReport = (params: { photoId?: string; userId?: string; number?: string }) => {
    if (eventId) router.push({ pathname: "/events/[id]/report", params: { id: eventId, ...params } });
  };

  /** After the sheet has gone: the report opens over the roll, and iOS drops it over a closing sheet. */
  const reportAfterSheet = (params: { userId?: string }) => {
    closeSheet();
    afterSheetCloses.current = () => openReport(params);
  };

  const onConfirmBlock = () => {
    if (!blockTarget || blockMutation.isPending) return;
    const { userId, name, over } = blockTarget;
    setBlockError(null);
    blockMutation.mutate(userId, {
      onSuccess: () => {
        setBlockTarget(null);
        // Their frames are gone for you now, the one on screen included.
        if (over === "viewer") gallery.onCloseFrame();
        else closeSheet();
        showNotice(t("report:block.done", { name }));
      },
      onError: (error) => setBlockError(getErrorMessage(error, t("report:block.failed"))),
    });
  };

  const onCancelBlock = () => {
    if (blockMutation.isPending) return;
    if (blockTarget?.over === "roll") closeSheet();
    setBlockTarget(null);
    setBlockError(null);
  };

  const openFrame = gallery.openFrame;
  const ownsOpenFrame = !!openFrame && !!user && openFrame.photo.addedById === user.id;
  const openFrameOwnerId = ownsOpenFrame ? null : openFrame?.photo.addedById;
  const frameOwnerName = (frame: SheetFrame) => frame.uploader?.name ?? frame.by ?? t("gallery.unknownUploader");

  return {
    ...gallery,
    loadMore: () => {
      if (photosQuery.hasNextPage && !photosQuery.isFetching) void photosQuery.fetchNextPage();
    },
    hasMore: photosQuery.hasNextPage,
    loadingMore: photosQuery.isFetchingNextPage,
    galleryError: photosQuery.isError,
    event,
    participants,
    frames: gallery.visibleFrames,
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
    notice: tray.storageError ? t("result.localStorage") : (notice ?? sentNotice),
    openedVisible,
    sheet: shownSheet,
    arrivalNote,
    isLeaving: leaveEventMutation.isPending,
    isCutting: deactivateMutation.isPending,
    removing,
    isRemoving: removeParticipantMutation.isPending,
    person,
    blockTarget,
    viewerBlocking:
      blockTarget?.over === "viewer"
        ? { name: blockTarget.name, busy: blockMutation.isPending, error: blockError }
        : null,
    rollBlocking:
      blockTarget?.over === "roll"
        ? { name: blockTarget.name, busy: blockMutation.isPending, error: blockError }
        : null,
    onRefresh,
    onBack,
    onDismissOpened: () => setOpenedDismissed(true),
    onAddFirstPhotos: () => {
      setOpenedDismissed(true);
      void onAddPhotos();
    },
    onAddPhotos: () => void onAddPhotos(),
    onOpenTray: openTray,
    onSendWhatFits,
    onPickAgain,
    onDismissClosed,
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
    // 11.2 / 11.8: someone else on the roll call.
    onOpenPerson: (participant: EventParticipantResponseDto) => {
      setPerson(participant);
      setSheet("person");
    },
    canRemovePerson:
      role === "host" && event?.status === "ACTIVE" && !!person && person.accessLevel !== "ORGANIZER",
    onRemovePerson: () => {
      if (!person) return;
      setRemoving(person);
      setSheet("remove");
    },
    onReportPerson: () => {
      if (person) reportAfterSheet({ userId: person.userId });
    },
    onBlockPerson: () => {
      if (!person) return;
      setBlockError(null);
      setBlockTarget({ userId: person.userId, name: person.name || t("people.unknown"), over: "roll" });
      setSheet("block");
    },
    onUnblockPerson: () => {
      if (!person) return;
      const name = person.name || t("people.unknown");
      unblockMutation.mutate(person.userId, {
        onSuccess: () => {
          closeSheet();
          showNotice(t("report:menu.unblocked", { name }));
        },
        onError: (error) => {
          closeSheet();
          showNotice(getErrorMessage(error));
        },
      });
    },
    // 10.6: anyone but a host can report the roll from its menu.
    onReportRoll: () => reportAfterSheet({}),
    // 10.1: someone else's frame, from the frame menu (09.3, 09.4). The viewer is closed by then.
    onReportFrame:
      openFrame && !ownsOpenFrame
        ? () => {
            openReport({ photoId: openFrame.photo.id, number: String(openFrame.number) });
          }
        : undefined,
    onBlockFrameOwner:
      openFrame && openFrameOwnerId
        ? () => {
            setBlockError(null);
            setBlockTarget({ userId: openFrameOwnerId, name: frameOwnerName(openFrame), over: "viewer" });
          }
        : undefined,
    onCancelBlock,
    onConfirmBlock,
    onBackToPeople: () => setSheet("people"),
    onConfirmRemove,
    onOpenRules: () => router.push("/terms-of-use"),
  };
};
