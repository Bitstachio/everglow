import { NotificationType } from "generated/prisma/client";

/** What a phone shows, and where tapping it goes. */
export interface RenderedNotification {
  title: string;
  body: string;
  /** An expo-router path in the app, e.g. /events/<id>. Never an outside URL. */
  url: string;
}

/**
 * The ids each type is built from. Ids only: copy is written here, never
 * taken from what a person typed (docs/notifications.md §1).
 */
export type NotificationDataByType = {
  TEST: { nonce: string };
};

export interface NotificationDefinition<TData> {
  /**
   * Safety and account notices people cannot turn off in settings (EV-142):
   * the preference check is skipped for them.
   */
  required: boolean;
  /**
   * One notification per key, ever (until retention deletes it). Name the
   * occasion, not the moment: gallery_closing:1d:<eventId>:<userId>.
   */
  dedupeKey: (userId: string, data: TData) => string;
  render: (data: TData) => RenderedNotification;
}

type Catalogue = { [T in NotificationType]: NotificationDefinition<NotificationDataByType[T]> };

/**
 * Every notification type, in one place, like the API's error codes. Adding a
 * type: add it to the NotificationType enum (with a migration), to
 * NotificationDataByType, and here; the compiler checks that all three agree.
 * Copy follows docs/voice.md.
 */
export const NOTIFICATION_CATALOGUE: Catalogue = {
  TEST: {
    required: false,
    dedupeKey: (userId, { nonce }) => `test:${nonce}:${userId}`,
    render: () => ({
      title: "Everglow",
      body: "Test frame. If you can read this, notifications reach this phone.",
      url: "/",
    }),
  },
};

export const renderNotification = <T extends NotificationType>(
  type: T,
  data: NotificationDataByType[T],
): RenderedNotification => NOTIFICATION_CATALOGUE[type].render(data);
