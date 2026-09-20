import type { Event } from "../types";

export const buildEvent = (overrides: Partial<Event> = {}): Event => ({
  id: "event-1",
  title: "Weekend meetup",
  description: "An afternoon with friends",
  date: "2026-09-20T15:30:00.000Z",
  creatorId: "user-1",
  invitationUrl: "https://events.everglow.app/invite/weekend",
  createdAt: "2026-09-01T12:00:00.000Z",
  updatedAt: "2026-09-01T12:00:00.000Z",
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
