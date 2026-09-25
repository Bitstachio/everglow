import type { Event, EventParticipantResponseDto, Photo } from "../types";

export const buildEvent = (overrides: Partial<Event> = {}): Event => ({
  id: "event-1",
  title: "Weekend meetup",
  description: "An afternoon with friends",
  date: "2026-09-20T15:30:00.000Z",
  creatorId: "user-1",
  invitationUrl: "https://events.everglow.app/invite/weekend",
  coverUrl: null,
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
