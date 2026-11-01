import { onAccountCleared } from "@/lib/account-cleared";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import Share from "react-native-share";
import { getErrorMessage } from "@/lib/api/errors";
import { readAllGalleryPhotos, type SignedPhoto } from "../api/gallery";
import { useDeleteEventPhotoMutation, useRefreshRollAfterUpload } from "../api/mutations";
import { useRenewEventPhoto } from "../api/queries";
import {
  isGonePhotoError,
  prepareSharedPhotos,
  requestLibraryAddAccess,
  saveEventPhoto,
} from "../api/save-event-photos";
import type { SheetFrame } from "../lib/roll-page";
import type { PhotoResponseDto } from "../types";

type Props = {
  eventId: string;
  userId?: string;
  /** Whether actions may run. Frames stay visible without it, for example while leaving. */
  enabled: boolean;
  canDeleteOthers: boolean;
  canDelete: boolean;
  frames: SheetFrame[];
  /** The contact sheet's frames by id, with when their links were signed. */
  listed: Map<string, SignedPhoto>;
  showNotice: (message: string) => void;
};

type Busy = "prepare" | "save" | "share" | "delete";
type Progress = { kind: "save" | "share"; done: number; total: number };

const isAbort = (error: unknown) => error instanceof Error && error.name === "AbortError";

/** Chapter 09 actions share one lock and are cancelled when the visible roll/account changes. */
export const useRollGallery = ({
  eventId,
  userId,
  enabled,
  canDeleteOthers,
  canDelete,
  frames,
  listed,
  showNotice,
}: Props) => {
  const { t } = useTranslation("roll");
  const renewPhoto = useRenewEventPhoto(eventId);
  const deletePhoto = useDeleteEventPhotoMutation();
  const refreshRoll = useRefreshRollAfterUpload();
  const [openId, setOpenId] = useState<string | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<PhotoResponseDto[]>([]);
  const [deleted, setDeleted] = useState<Set<string>>(new Set());
  const [deleteTargets, setDeleteTargets] = useState<PhotoResponseDto[] | null>(null);
  const [saveAllPhotos, setSaveAllPhotos] = useState<PhotoResponseDto[] | null>(null);
  const [includeMine, setIncludeMine] = useState(false);
  // What the last save of several frames didn't save, for "Retry N unsaved".
  const [unsaved, setUnsaved] = useState<string[]>([]);
  const [busy, setBusy] = useState<Busy | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  // Frames that save of several did save, so trying again saves only the rest.
  const saved = useRef(new Set<string>());
  // Frames read for Select all or Save all that the contact sheet hasn't paged in.
  const bulk = useRef(new Map<string, SignedPhoto>());
  const pendingSave = useRef<string[] | null>(null);
  const job = useRef<AbortController | null>(null);
  const scopeRef = useRef<AbortController | null>(null);
  const scope = `${eventId}:${userId ?? ""}:${enabled}`;
  const [stateScope, setStateScope] = useState(scope);
  if (stateScope !== scope) {
    setStateScope(scope);
    setOpenId(null);
    setSelecting(false);
    setSelected([]);
    setDeleted(new Set());
    setDeleteTargets(null);
    setSaveAllPhotos(null);
    setUnsaved([]);
    setBusy(null);
    setProgress(null);
  }
  useEffect(() => {
    const controller = new AbortController();
    scopeRef.current = controller;
    saved.current = new Set();
    bulk.current = new Map();
    pendingSave.current = null;
    const unsubscribe = onAccountCleared(() => controller.abort());
    return () => {
      unsubscribe();
      controller.abort();
      if (scopeRef.current === controller) scopeRef.current = null;
    };
  }, [scope]);

  const visibleFrames = frames.filter((frame) => !deleted.has(frame.photo.id));
  const openFrame = (enabled && visibleFrames.find((frame) => frame.photo.id === openId)) || null;
  const selectedPhotos = enabled ? selected.filter((photo) => !deleted.has(photo.id)) : [];
  const deletable = (photo: PhotoResponseDto) =>
    canDelete && (canDeleteOthers || (!!userId && photo.addedById === userId));
  const selectedDeletable = selectedPhotos.filter(deletable);
  const shownUnsaved = enabled ? unsaved.filter((id) => !deleted.has(id)) : [];

  /** The newest copy of a frame's links: the contact sheet's, or a bulk read's if that's newer. */
  const signed = (photo: PhotoResponseDto): SignedPhoto => {
    const copies = [listed.get(photo.id), bulk.current.get(photo.id)].filter((copy) => copy !== undefined);
    // A frame known only from an older render has links of unknown age: renew them.
    return copies.sort((a, b) => b.signedAt - a.signedAt)[0] ?? { photo, signedAt: 0 };
  };
  const byId = (ids: string[]) => {
    const known = new Map(
      [...frames.map((frame) => frame.photo), ...selected, ...(saveAllPhotos ?? [])].map((photo) => [photo.id, photo]),
    );
    return ids.flatMap((id) => {
      const photo = known.get(id) ?? bulk.current.get(id)?.photo;
      return photo ? [signed(photo)] : [];
    });
  };

  const markGone = (ids: string[]) => {
    if (!ids.length) return;
    setDeleted((previous) => new Set([...previous, ...ids]));
    void refreshRoll(eventId).catch(() => undefined);
  };

  const start = (kind: Busy) => {
    const scopeAbort = scopeRef.current;
    if (!enabled || !userId || job.current || !scopeAbort || scopeAbort.signal.aborted) return null;
    const controller = new AbortController();
    const stop = () => controller.abort();
    scopeAbort.signal.addEventListener("abort", stop);
    job.current = controller;
    setBusy(kind);
    return {
      signal: controller.signal,
      active: () => !controller.signal.aborted,
      /** The roll or account changed: leave state alone, it was reset already. */
      scopeGone: () => scopeAbort.signal.aborted,
      finish: () => {
        scopeAbort.signal.removeEventListener("abort", stop);
        if (job.current === controller) job.current = null;
        if (!scopeAbort.signal.aborted) {
          setBusy(null);
          setProgress(null);
        }
      },
    };
  };

  /**
   * Saves frames to Photos, one at a time. A save of several remembers what it
   * saved, so Retry or another Save all saves only the rest; a frame saved on
   * its own counts toward that but never clears what's still unsaved.
   */
  const save = async (ids: string[], kind: "frame" | "batch") => {
    if (!ids.length) return;
    const task = start("save");
    if (!task) return;
    const rest = kind === "batch" ? ids.filter((id) => !saved.current.has(id)) : ids;
    if (kind === "batch" && rest.length === 0) saved.current.clear();
    const pending = rest.length ? rest : ids;
    const failed: string[] = [];
    const gone: string[] = [];
    let done = 0;
    try {
      if (!(await requestLibraryAddAccess())) {
        if (task.active()) showNotice(t("result.libraryAccess"));
        return;
      }
      const photos = byId(pending);
      setProgress({ kind: "save", done: 0, total: photos.length });
      for (const [index, { photo, signedAt }] of photos.entries()) {
        if (!task.active()) {
          // Stopped: what wasn't tried stays unsaved.
          failed.push(...photos.slice(index).map((item) => item.photo.id));
          break;
        }
        try {
          await saveEventPhoto(photo, signedAt, task.signal);
          done += 1;
          // A frame saved on its own counts only while a save of several is unfinished.
          if (kind === "batch" || unsaved.length > 0) saved.current.add(photo.id);
        } catch (error) {
          if (isGonePhotoError(error)) gone.push(photo.id);
          else failed.push(photo.id);
        }
        if (task.active()) setProgress({ kind: "save", done: index + 1, total: photos.length });
      }
      if (task.scopeGone()) return;
      const stopped = !task.active();
      markGone(gone);

      if (kind === "batch") {
        setUnsaved(failed);
        if (!failed.length) saved.current.clear();
      } else {
        // On its own, a frame only leaves the list once it's saved or gone.
        const left = unsaved.filter((id) => !(done && id === ids[0]) && !gone.includes(id));
        setUnsaved(left);
        if (!left.length) saved.current.clear();
      }

      const total = photos.length - gone.length;
      if (total === 0) showNotice(t("result.gone", { count: gone.length }));
      else if (done === total) showNotice(t("result.saved", { count: done }));
      else if (done === 0) {
        if (!stopped) showNotice(t("result.saveFailed"));
      } else showNotice(t("result.savedSome", { saved: done, total }));
    } catch (error) {
      if (!task.scopeGone()) showNotice(getErrorMessage(error, t("result.saveFailed")));
    } finally {
      task.finish();
    }
  };

  /**
   * Shares local copies, never signed links. The files outlive the share sheet
   * (Android's receiving app may still be reading them) until the next share.
   */
  const share = async (ids: string[]) => {
    if (!ids.length) return;
    const task = start("share");
    if (!task) return;
    try {
      const photos = byId(ids);
      setProgress({ kind: "share", done: 0, total: photos.length });
      const files = await prepareSharedPhotos(photos, {
        signal: task.signal,
        onProgress: (done) => {
          if (task.active()) setProgress({ kind: "share", done, total: photos.length });
        },
      });
      if (!task.active()) return;
      await Share.open({ urls: files.map((file) => file.uri), type: "image/*", failOnCancel: false });
    } catch (error) {
      if (task.scopeGone() || isAbort(error)) return;
      // Someone deleted one of them: reload the roll so another try leaves it out.
      if (isGonePhotoError(error)) void refreshRoll(eventId).catch(() => undefined);
      showNotice(t("gallery.shareFailed"));
    } finally {
      task.finish();
    }
  };

  const prepareAll = async (action: "save" | "select") => {
    const task = start("prepare");
    if (!task) return;
    try {
      const photos = await readAllGalleryPhotos(eventId, task.signal);
      if (!task.active()) return;
      photos.forEach((item) => bulk.current.set(item.photo.id, item));
      const all = photos.map((item) => item.photo);
      if (action === "select") setSelected(all);
      else {
        setIncludeMine(false);
        setSaveAllPhotos(all);
      }
    } catch (error) {
      if (task.active()) showNotice(getErrorMessage(error, t("gallery.loadFailed")));
    } finally {
      task.finish();
    }
  };

  const confirmDelete = async () => {
    const targets = deleteTargets?.filter(deletable) ?? [];
    if (!targets.length) return;
    const task = start("delete");
    if (!task) return;
    const removed = new Set<string>();
    try {
      for (const photo of targets) {
        if (!task.active()) return;
        try {
          // The server still enforces ownership and moderation; an already-removed frame counts as removed.
          await deletePhoto.mutateAsync({ eventId, photoId: photo.id });
          removed.add(photo.id);
        } catch {
          /* Keep unsuccessful frames selected and offer the action again. */
        }
      }
      if (!task.active()) return;
      setDeleted((previous) => new Set([...previous, ...removed]));
      setSelected((previous) => previous.filter((photo) => !removed.has(photo.id)));
      if (openId && removed.has(openId)) setOpenId(null);
      setDeleteTargets(null);
      showNotice(
        removed.size === targets.length
          ? t("gallery.deleted", { count: removed.size })
          : t("gallery.deleteFailed", { count: targets.length - removed.size }),
      );
    } finally {
      task.finish();
    }
  };

  const onRetryFrame = async () => {
    const signal = scopeRef.current?.signal;
    if (!openFrame || !enabled || !signal) throw new Error("No visible frame");
    // Only this frame's link, written into the contact sheet so it opens with it next time.
    // A frame that's gone answers 404. The viewer loads the renewed links it resolves with.
    return renewPhoto(openFrame.photo.id, signal);
  };

  const toggle = (frame: SheetFrame) => {
    if (!enabled || busy) return;
    setSelecting(true);
    setSelected((previous) =>
      previous.some((photo) => photo.id === frame.photo.id)
        ? previous.filter((photo) => photo.id !== frame.photo.id)
        : [...previous, frame.photo],
    );
  };
  const saveCandidates = saveAllPhotos?.filter((photo) => includeMine || photo.addedById !== userId) ?? [];
  return {
    visibleFrames,
    openFrame,
    selecting: enabled && selecting,
    selectedIds: new Set(selectedPhotos.map((photo) => photo.id)),
    selectedCount: selectedPhotos.length,
    selectedDeletableCount: selectedDeletable.length,
    selectedMineCount: selectedPhotos.filter((photo) => photo.addedById === userId).length,
    busy,
    progress,
    unsavedCount: shownUnsaved.length,
    saveAllPhotos,
    includeMine,
    saveCount: saveCandidates.length,
    ownPhotoCount: saveAllPhotos?.filter((photo) => photo.addedById === userId).length ?? 0,
    deleteTargets: enabled ? deleteTargets : null,
    openFrameIsDeletable: !!openFrame && deletable(openFrame.photo),
    onOpenFrame: (frame: SheetFrame) => {
      if (selecting) toggle(frame);
      else setOpenId(frame.photo.id);
    },
    onCloseFrame: () => {
      setOpenId(null);
      setDeleteTargets(null);
    },
    onMoveFrame: (id: string) => setOpenId(id),
    onRetryFrame,
    onSelectFrame: toggle,
    onCancelSelection: () => {
      if (!busy) {
        setSelecting(false);
        setSelected([]);
      }
    },
    onSelectAll: () => void prepareAll("select"),
    onSaveAll: () => void prepareAll("save"),
    onCloseSaveAll: () => setSaveAllPhotos(null),
    onToggleIncludeMine: () => setIncludeMine((value) => !value),
    onConfirmSaveAll: () => {
      pendingSave.current = saveCandidates.map((photo) => photo.id);
      setSaveAllPhotos(null);
    },
    onSaveSheetClosed: () => {
      const ids = pendingSave.current;
      pendingSave.current = null;
      if (ids) void save(ids, "batch");
    },
    onSaveFrame: () => {
      if (openFrame) void save([openFrame.photo.id], "frame");
    },
    onSaveSelection: () =>
      void save(
        selectedPhotos.map((photo) => photo.id),
        "batch",
      ),
    onRetrySave: () => void save(shownUnsaved, "batch"),
    onDismissUnsaved: () => {
      if (busy) return;
      setUnsaved([]);
      saved.current.clear();
    },
    /** Stops the running save or share; what it hadn't done yet is left undone. */
    onStopExport: () => {
      if (busy === "save" || busy === "share") job.current?.abort();
    },
    onShareFrame: () => {
      if (openFrame) void share([openFrame.photo.id]);
    },
    onShareSelection: () => void share(selectedPhotos.map((photo) => photo.id)),
    onDeleteFrame: () => {
      if (openFrame && deletable(openFrame.photo)) setDeleteTargets([openFrame.photo]);
    },
    onDeleteSelection: () => setDeleteTargets(selectedDeletable),
    onCancelDelete: () => {
      if (!busy) setDeleteTargets(null);
    },
    onConfirmDelete: () => void confirmDelete(),
  };
};
