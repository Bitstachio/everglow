import type { Event, EventParticipantResponseDto, InvitePreviewResponseDto, Photo } from "../types";

export const buildEvent = (overrides: Partial<Event> = {}): Event => ({
  id: "event-1",
  title: "Weekend meetup",
  description: "An afternoon with friends",
  date: "2026-09-20T15:30:00.000Z",
  creatorId: "user-1",
  invitationUrl: "https://events.everglow.app/invite/weekend",
  invites: [
    { accessLevel: "PARTICIPANT", invitationUrl: "https://events.everglow.app/invite/weekend" },
    { accessLevel: "VIEWER", invitationUrl: "https://events.everglow.app/invite/weekend-viewer" },
    { accessLevel: "ORGANIZER", invitationUrl: "https://events.everglow.app/invite/weekend-organizer" },
  ],
  coverUrl: null,
  status: "ACTIVE",
  plan: "FREE",
  galleryState: "OPEN",
  galleryOpensAt: "2026-09-20T15:30:00.000Z",
  galleryClosesAt: "2026-10-20T15:30:00.000Z",
  galleryWindowDays: 30,
  galleryWindowOptions: [3, 7, 14, 30],
  deactivatedAt: null,
  deactivatedById: null,
  limits: { members: 30, storageBytes: "3221225472" },
  usage: { members: 1, storageBytes: "0" },
  photoCount: 0,
  createdAt: "2026-09-01T12:00:00.000Z",
  updatedAt: "2026-09-01T12:00:00.000Z",
  ...overrides,
});

export const buildPhoto = (overrides: Partial<Photo> = {}): Photo => ({
  id: "photo-1",
  eventId: "event-1",
  addedById: "user-1",
  url: "https://cdn.example.com/photo-1.jpg",
  thumbnailUrl: "https://cdn.example.com/photo-1-thumb.webp",
  contentType: "image/jpeg",
  createdAt: "2026-09-01T12:00:00.000Z",
  ...overrides,
});

export const buildParticipant = (
  overrides: Partial<EventParticipantResponseDto> = {},
): EventParticipantResponseDto => ({
  userId: "user-1",
  username: "ada",
  name: "Ada Lovelace",
  accessLevel: "ORGANIZER",
  avatarUrl: null,
  isBlockedByCaller: false,
  photoCount: 0,
  ...overrides,
});

export const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

/** The envelope behind an invite (06.4): Sam's wedding, joinable, adding photos. */
export const buildInvitePreview = (overrides: Partial<InvitePreviewResponseDto> = {}): InvitePreviewResponseDto => ({
  state: "JOINABLE",
  eventId: null,
  title: "Sam & Jo’s wedding",
  date: new Date(2026, 9, 18, 16, 0).toISOString(),
  invitationUrl: "https://events.everglow.app/invite/k8Qm2",
  accessLevel: "PARTICIPANT",
  galleryState: "UPCOMING",
  galleryOpensAt: new Date(2026, 9, 18, 16, 0).toISOString(),
  galleryClosesAt: new Date(2026, 10, 17, 16, 0).toISOString(),
  memberCount: 24,
  memberLimit: 30,
  host: { userId: "user-sam", name: "Sam Rivera" },
  ...overrides,
});
