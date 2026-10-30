import { Directory, File, Paths } from "expo-file-system";
import { z } from "zod";
import type { Tray, TrayItem } from "./upload-tray";

const status = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("waiting") }),
  z.object({ kind: z.literal("sending"), bytesSent: z.number() }),
  z.object({ kind: z.literal("developed"), photoId: z.string() }),
  z.object({
    kind: z.literal("failed"),
    reason: z.enum(["connection", "refused", "noRoom", "closed", "interrupted", "missing"]),
  }),
  z.object({ kind: z.literal("rejected"), reason: z.enum(["video", "tooLarge"]) }),
]);
const item = z.object({
  key: z.string(),
  name: z.string(),
  uri: z.string(),
  sizeBytes: z.number().nonnegative(),
  contentType: z.enum(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]),
  status,
  minted: z.object({ photoId: z.string(), seq: z.number() }).optional(),
});
const snapshot = z.object({
  version: z.literal(1),
  trays: z.array(
    z.tuple([
      z.string(),
      z.object({
        items: z.array(item),
        running: z.boolean(),
        closed: z.object({ at: z.string(), landed: z.number() }).nullable(),
      }),
    ]),
  ),
});

const folder = (userId: string) => new Directory(Paths.document, "upload-trays", encodeURIComponent(userId));
const snapshots = (directory: Directory) =>
  directory
    .list()
    .filter((entry): entry is File => entry instanceof File && /^jobs-\d+\.json$/.test(entry.name))
    .sort((a, b) => b.name.localeCompare(a.name));
let revision = Date.now();
const lastSnapshot = new Map<string, string>();

/** New files never replace the last readable snapshot until the write succeeds. */
export const persistUploadTrays = (userId: string, trays: Map<string, Tray>) => {
  const directory = folder(userId);
  directory.create({ intermediates: true, idempotent: true });
  const data = JSON.stringify({
    version: 1,
    trays: [...trays].map(([eventId, tray]) => [
      eventId,
      {
        ...tray,
        items: tray.items.map((file) =>
          file.status.kind === "sending" ? { ...file, status: { kind: "sending", bytesSent: 0 } } : file,
        ),
      },
    ]),
  });
  // Byte progress doesn't warrant a filesystem write on every native callback.
  if (lastSnapshot.get(userId) === data) return;
  revision = Math.max(revision + 1, Date.now());
  const file = new File(directory, `jobs-${revision}.json`);
  file.write(data);
  lastSnapshot.set(userId, data);
  for (const old of snapshots(directory).slice(2)) {
    try {
      old.delete();
    } catch {
      /* A committed snapshot remains usable if old metadata cannot be reclaimed. */
    }
  }
};

/** A stopped JS runtime has no live progress callbacks: show interrupted frames with Retry. */
export const restoreUploadTrays = (userId: string): Map<string, Tray> => {
  const directory = folder(userId);
  if (!directory.exists) return new Map();
  let files: File[];
  try {
    files = snapshots(directory);
  } catch {
    return new Map();
  }
  for (const file of files) {
    try {
      const saved = snapshot.parse(JSON.parse(file.textSync()));
      const restored = new Map<string, Tray>(
        saved.trays.map(([eventId, tray]) => [
          eventId,
          {
            ...tray,
            running: false,
            items: tray.items
              .filter(
                (entry) =>
                  entry.status.kind === "rejected" ||
                  (entry.status.kind === "failed" && entry.status.reason === "missing") ||
                  entry.uri.startsWith(`${directory.uri.replace(/\/+$/, "")}/`),
              )
              .map((entry) =>
                entry.status.kind === "waiting" || entry.status.kind === "sending"
                  ? { ...entry, status: { kind: "failed" as const, reason: "interrupted" as const } }
                  : entry,
              ),
          },
        ]),
      );
      // Reclaim copies no longer referenced after successful uploads or cancellation.
      const retained = new Set([...restored.values()].flatMap((tray) => tray.items.map((entry) => entry.uri)));
      for (const entry of directory.list()) {
        if (entry instanceof File && entry.name.startsWith("picked-") && !retained.has(entry.uri)) entry.delete();
      }
      return restored;
    } catch {
      // A process can stop during a write; try the preceding complete snapshot.
    }
  }
  return new Map();
};

/** Picker cache files may disappear after termination; retain exact bytes in private app storage. */
export const retainUploadFiles = async (userId: string, items: TrayItem[]): Promise<TrayItem[]> => {
  const directory = folder(userId);
  directory.create({ intermediates: true, idempotent: true });
  const created: File[] = [];
  try {
    const retained: TrayItem[] = [];
    for (const entry of items) {
      if (entry.status.kind === "failed" && entry.status.reason === "missing") {
        retained.push({ ...entry, uri: "" });
        continue;
      }
      if (entry.status.kind === "rejected") {
        retained.push(entry);
        continue;
      }
      const file = new File(directory, `${entry.key}.upload`);
      created.push(file);
      await new File(entry.uri).copy(file);
      retained.push({ ...entry, uri: file.uri });
    }
    return retained;
  } catch (error) {
    for (const file of created) {
      if (file.exists) file.delete();
    }
    throw error;
  }
};

export const releaseUploadFile = (userId: string, uri: string) => {
  const directory = folder(userId);
  if (uri.startsWith(`${directory.uri.replace(/\/+$/, "")}/picked-`)) {
    const file = new File(uri);
    try {
      if (file.exists) file.delete();
    } catch {
      /* Reclaimed on the next restoration. */
    }
  }
};

/** Deliberate sign-out/account deletion discards this account's pending local photos. */
export const removeUploadStorage = (userId: string) => {
  lastSnapshot.delete(userId);
  const directory = folder(userId);
  try {
    if (directory.exists) directory.delete();
  } catch {
    /* Remains scoped to this signed-out account. */
  }
};
