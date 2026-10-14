import { useSyncExternalStore } from "react";
import type { EventPhotoFile } from "./upload-event-photos";

/**
 * Event photos that did not upload, per event, for this app session. Held
 * outside React so the list survives leaving and reopening the event screen.
 * It is not persisted: the picker's copies live in the cache directory, which
 * the OS may clear between launches (EV-119 covers resuming across launches).
 */
const failedByEvent = new Map<string, EventPhotoFile[]>();
const listeners = new Set<() => void>();
const NONE: EventPhotoFile[] = [];

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const getFailedPhotoUploads = (eventId: string): EventPhotoFile[] => failedByEvent.get(eventId) ?? NONE;

export const setFailedPhotoUploads = (eventId: string, files: EventPhotoFile[]) => {
  if (files.length > 0) failedByEvent.set(eventId, files);
  else failedByEvent.delete(eventId);
  listeners.forEach((listener) => listener());
};

/** Forgets every event's failed uploads; for tests. */
export const resetFailedPhotoUploads = () => {
  failedByEvent.clear();
  listeners.forEach((listener) => listener());
};

export const useFailedPhotoUploads = (eventId: string | undefined): EventPhotoFile[] =>
  useSyncExternalStore(subscribe, () => (eventId ? getFailedPhotoUploads(eventId) : NONE));
