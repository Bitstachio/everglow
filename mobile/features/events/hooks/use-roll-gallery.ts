import { onAccountCleared } from "@/lib/account-cleared";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import * as MediaLibrary from "expo-media-library";
import Share from "react-native-share";
import type { File } from "expo-file-system";
import { getErrorMessage } from "@/lib/api/errors";
import { readAllGalleryPhotos, readGalleryPhoto, removeGalleryPhoto, useRefreshGallery } from "../api/gallery";
import { discardExportFile, downloadExportPhoto } from "../lib/export-photo";
import type { SheetFrame } from "../lib/roll-page";
import type { PhotoResponseDto } from "../types";

type Props = {
  eventId: string;
  userId?: string;
  enabled: boolean;
  canDeleteOthers: boolean;
  canDelete: boolean;
  frames: SheetFrame[];
  showNotice: (message: string) => void;
};
type Progress = { done: number; total: number };

/** Chapter 09 actions share one lock and are cancelled when the visible roll/account changes. */
export const useRollGallery = ({ eventId, userId, enabled, canDeleteOthers, canDelete, frames, showNotice }: Props) => {
  const { t } = useTranslation("roll");
  const refresh = useRefreshGallery(eventId);
  const [openId, setOpenId] = useState<string | null>(null);
  const [renewed, setRenewed] = useState<PhotoResponseDto | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<PhotoResponseDto[]>([]);
  const [deleted, setDeleted] = useState<Set<string>>(new Set());
  const [deleteTargets, setDeleteTargets] = useState<PhotoResponseDto[] | null>(null);
  const [saveAllPhotos, setSaveAllPhotos] = useState<PhotoResponseDto[] | null>(null);
  const [includeMine, setIncludeMine] = useState(false);
  const [failedSaves, setFailedSaves] = useState<string[]>([]);
  const [busy, setBusy] = useState<"prepare" | "save" | "share" | "delete" | null>(null);
  const [saving, setSaving] = useState<Progress | null>(null);
  const pendingSave = useRef<string[] | null>(null);
  const job = useRef<AbortController | null>(null);
  const scope = `${eventId}:${userId ?? ""}:${enabled}`;
  const session = useMemo(() => ({ scope, controller: new AbortController() }), [scope]);
  const scopeAbort = session.controller;
  const [stateScope, setStateScope] = useState(scope);
  if (stateScope !== scope) {
    setStateScope(scope);
    setOpenId(null);
    setRenewed(null);
    setSelecting(false);
    setSelected([]);
    setDeleted(new Set());
    setDeleteTargets(null);
    setSaveAllPhotos(null);
    setFailedSaves([]);
    setBusy(null);
    setSaving(null);
  }
  useEffect(() => {
    pendingSave.current = null;
    const unsubscribe = onAccountCleared(() => {
      scopeAbort.abort();
      job.current?.abort();
    });
    return () => {
      unsubscribe();
      scopeAbort.abort();
      job.current?.abort();
      job.current = null;
    };
  }, [scopeAbort]);

  const visibleFrames = enabled ? frames.filter((frame) => !deleted.has(frame.photo.id)) : [];
  const current = visibleFrames.find((frame) => frame.photo.id === openId) ?? null;
  const openFrame = current && renewed?.id === current.photo.id ? { ...current, photo: renewed } : current;
  const selectedPhotos = enabled ? selected.filter((photo) => !deleted.has(photo.id)) : [];
  const deletable = (photo: PhotoResponseDto) =>
    canDelete && (canDeleteOthers || (!!userId && photo.addedById === userId));
  const selectedDeletable = selectedPhotos.filter(deletable);

  const start = (kind: NonNullable<typeof busy>) => {
    if (!enabled || !userId || job.current || scopeAbort.signal.aborted) return null;
    const controller = new AbortController();
    job.current = controller;
    setBusy(kind);
    return {
      signal: controller.signal,
      active: () => !controller.signal.aborted && !scopeAbort.signal.aborted,
      finish: () => {
        if (job.current !== controller) return;
        job.current = null;
        if (!controller.signal.aborted && !scopeAbort.signal.aborted) {
          setBusy(null);
          setSaving(null);
        }
      },
    };
  };

  const save = async (ids: string[]) => {
    if (!ids.length) return;
    const task = start("save");
    if (!task) return;
    const failed: string[] = [];
    let saved = 0;
    try {
      // Add-only access suffices; a save must not ask to read the person's library.
      const permission = await MediaLibrary.requestPermissionsAsync(true);
      if (!task.active()) return;
      if (!permission.granted && permission.status !== "granted") {
        setFailedSaves(ids);
        showNotice(t("result.libraryAccess"));
        return;
      }
      setFailedSaves([]);
      setSaving({ done: 0, total: ids.length });
      for (const id of ids) {
        if (!task.active()) return;
        let file: File | undefined;
        try {
          const photo = await readGalleryPhoto(id, task.signal);
          if (!task.active()) return;
          file = await downloadExportPhoto(photo);
          if (!task.active()) return;
          await MediaLibrary.Asset.create(file.uri);
          saved++;
        } catch {
          failed.push(id);
        } finally {
          if (file) discardExportFile(file);
        }
        if (!task.active()) return;
        setSaving({ done: saved + failed.length, total: ids.length });
      }
      setFailedSaves(failed);
      showNotice(
        saved === ids.length
          ? t("result.saved", { count: saved })
          : saved
            ? t("result.savedSome", { saved, total: ids.length })
            : t("result.saveFailed"),
      );
    } catch (error) {
      if (task.active()) {
        setFailedSaves(ids);
        showNotice(getErrorMessage(error, t("result.saveFailed")));
      }
    } finally {
      task.finish();
    }
  };

  const share = async (ids: string[]) => {
    if (!ids.length) return;
    const task = start("share");
    if (!task) return;
    const files: File[] = [];
    try {
      for (const id of ids) {
        const photo = await readGalleryPhoto(id, task.signal);
        if (!task.active()) return;
        files.push(await downloadExportPhoto(photo));
        if (!task.active()) return;
      }
      await Share.open({ urls: files.map((file) => file.uri), type: "image/*", failOnCancel: false });
    } catch (error) {
      if (task.active()) showNotice(getErrorMessage(error, t("gallery.shareFailed")));
    } finally {
      files.forEach(discardExportFile);
      task.finish();
    }
  };

  const prepareAll = async (action: "save" | "select") => {
    const task = start("prepare");
    if (!task) return;
    try {
      const photos = await readAllGalleryPhotos(eventId, task.signal);
      if (!task.active()) return;
      if (action === "select") setSelected(photos);
      else {
        setIncludeMine(false);
        setSaveAllPhotos(photos);
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
          await removeGalleryPhoto(photo.id, task.signal);
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
      await refresh();
    } finally {
      task.finish();
    }
  };

  const onRetryFrame = async () => {
    if (!openFrame || !enabled) throw new Error("No visible frame");
    const id = openFrame.photo.id;
    const photo = await readGalleryPhoto(id, scopeAbort.signal);
    if (!scopeAbort.signal.aborted) setRenewed(photo);
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
    saving,
    failedSaves,
    saveAllPhotos,
    includeMine,
    saveCount: saveCandidates.length,
    ownPhotoCount: saveAllPhotos?.filter((photo) => photo.addedById === userId).length ?? 0,
    deleteTargets: enabled ? deleteTargets : null,
    openFrameIsDeletable: !!openFrame && deletable(openFrame.photo),
    onOpenFrame: (frame: SheetFrame) => {
      if (selecting) toggle(frame);
      else {
        setRenewed(null);
        setOpenId(frame.photo.id);
      }
    },
    onCloseFrame: () => {
      setOpenId(null);
      setDeleteTargets(null);
    },
    onMoveFrame: (id: string) => {
      setRenewed(null);
      setOpenId(id);
    },
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
      if (ids) void save(ids);
    },
    onSaveFrame: () => {
      if (openFrame) void save([openFrame.photo.id]);
    },
    onSaveSelection: () => void save(selectedPhotos.map((photo) => photo.id)),
    onRetrySave: () => void save(failedSaves),
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
