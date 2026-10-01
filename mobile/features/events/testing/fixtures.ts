import type { Event, EventParticipantResponseDto, Photo } from "../types";

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
  galleryClosesAt: "2026-10-20T15:30:00.000Z",
  limits: { members: 30, storageBytes: "3221225472" },
  usage: { members: 1, storageBytes: "0" },
  createdAt: "2026-09-01T12:00:00.000Z",
  updatedAt: "2026-09-01T12:00:00.000Z",
  ...overrides,
});

export const buildPhoto = (overrides: Partial<Photo> = {}): Photo => ({
  id: "photo-1",
  eventId: "event-1",
  addedById: "user-1",
  url: "https://cdn.example.com/photo-1.jpg",
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
