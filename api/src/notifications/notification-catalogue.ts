import { NotificationType } from "generated/prisma/client";

/** What a phone shows, and where tapping it goes. */
export interface RenderedNotification {
  title: string;
  body: string;
  /** An expo-router path in the app, e.g. /events/<id>. Never an outside URL. */
  url: string;
}

/**
 * The languages copy is written in. A phone's BCP 47 tag (UserDevice.locale)
 * picks one by its language; anything else gets English. Translating later
 * means adding the language here and its copy to each entry, nothing more.
 */
export const NOTIFICATION_LOCALES = ["en"] as const;
export type NotificationLocale = (typeof NOTIFICATION_LOCALES)[number];
export const DEFAULT_NOTIFICATION_LOCALE: NotificationLocale = "en";

export const resolveNotificationLocale = (tag: string | null | undefined): NotificationLocale => {
  const language = tag?.split(/[-_]/)[0]?.toLowerCase() ?? "";
  return (NOTIFICATION_LOCALES as readonly string[]).includes(language)
    ? (language as NotificationLocale)
    : DEFAULT_NOTIFICATION_LOCALE;
};

/**
 * Android notification channels, one per kind of notification, each with its
 * own switch in the phone's settings and in the app's notification settings.
 * Android fixes a channel's importance once the phone creates it, so kinds
 * that need a different importance or toggle need their own channel. The app
 * creates the same ids (mobile/features/notifications/lib/push.ts); a new id
 * goes in both lists (docs/notifications.md §3).
 */
export const NOTIFICATION_CHANNELS = ["account", "reports"] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

/**
 * The ids each type is built from. Ids only: copy is written here, never
 * taken from what a person typed (docs/notifications.md §1).
 */
export type NotificationDataByType = {
  TEST: { nonce: string };
  /**
   * `targetKey` names the reported thing so several reports on the same
   * photo or member batch into one push (`photo:<id>` / `member:<id>`).
   */
  REPORT_TO_CHECK: { eventId: string; targetKey: string };
  PHOTO_HIDDEN: { eventId: string; photoId: string };
  PHOTO_REMOVED: { eventId: string; photoId: string };
  /** `reportId` keeps a later removal (after a rejoin) a separate occasion. */
  MEMBER_REMOVED: { eventId: string; reportId: string };
};

export interface NotificationDefinition<TData> {
  /**
   * Safety and account notices people cannot turn off in settings (EV-142):
   * the preference check is skipped for them.
   */
  required: boolean;
  /** The Android channel it is posted to (Expo's channelId). */
  channel: NotificationChannel;
  /**
   * How long Apple and Google keep trying to reach a phone that is off, as
   * Expo's `ttl`. Set it for notices that are pointless late ("closes
   * tomorrow"); unset, the platforms' default applies (up to about 4 weeks).
   */
  ttlSeconds?: number;
  /**
   * Whether stored data still has this type's shape. Rows are written by
   * older code too, so the sender checks before rendering and FAILs a row
   * that no longer matches, rather than sending broken copy.
   */
  isData: (data: unknown) => data is TData;
  /**
   * One notification per key, ever (until retention deletes it). Name the
   * occasion, not the moment: gallery_closing:1d:<eventId>:<userId>.
   */
  dedupeKey: (userId: string, data: TData) => string;
  /** The copy in `locale`, built from ids only. */
  render: (data: TData, locale: NotificationLocale) => RenderedNotification;
}

type Catalogue = { [T in NotificationType]: NotificationDefinition<NotificationDataByType[T]> };

/** A plain JSON object whose `keys` are all strings. */
const hasStringFields = <K extends string>(data: unknown, ...keys: K[]): data is Record<K, string> =>
  typeof data === "object" &&
  data !== null &&
  !Array.isArray(data) &&
  keys.every((key) => typeof (data as Record<string, unknown>)[key] === "string");

const TEST_COPY: Record<NotificationLocale, RenderedNotification> = {
  en: {
    title: "Everglow",
    body: "Test frame. If you can read this, notifications reach this phone.",
    url: "/",
  },
};

const REPORT_TO_CHECK_COPY: Record<NotificationLocale, Omit<RenderedNotification, "url">> = {
  en: { title: "A report to check", body: "Open the roll's reports to decide." },
};

const PHOTO_HIDDEN_COPY: Record<NotificationLocale, Omit<RenderedNotification, "url">> = {
  en: { title: "A photo is hidden", body: "It stays hidden until you review it." },
};

const PHOTO_REMOVED_COPY: Record<NotificationLocale, Omit<RenderedNotification, "url">> = {
  en: { title: "A photo was removed", body: "One of your photos was removed from a roll." },
};

const MEMBER_REMOVED_COPY: Record<NotificationLocale, Omit<RenderedNotification, "url">> = {
  en: {
    title: "Removed from a roll",
    body: "A host removed you. Only a host can let you back in.",
  },
};

/**
 * Every notification type, in one place, like the API's error codes. Adding a
 * type: add it to the NotificationType enum (with a migration), to
 * NotificationDataByType, and here; the compiler checks that all three agree.
 * Copy follows docs/voice.md.
 */
export const NOTIFICATION_CATALOGUE: Catalogue = {
  TEST: {
    required: false,
    channel: "account",
    isData: (data): data is NotificationDataByType["TEST"] => hasStringFields(data, "nonce"),
    dedupeKey: (userId, { nonce }) => `test:${nonce}:${userId}`,
    render: (_data, locale) => TEST_COPY[locale],
  },
  REPORT_TO_CHECK: {
    required: false,
    channel: "reports",
    ttlSeconds: 7 * 24 * 60 * 60,
    isData: (data): data is NotificationDataByType["REPORT_TO_CHECK"] =>
      hasStringFields(data, "eventId", "targetKey"),
    dedupeKey: (userId, { eventId, targetKey }) => `report_to_check:${eventId}:${targetKey}:${userId}`,
    render: ({ eventId }, locale) => ({
      ...REPORT_TO_CHECK_COPY[locale],
      url: `/events/${eventId}/reports`,
    }),
  },
  PHOTO_HIDDEN: {
    required: false,
    channel: "reports",
    ttlSeconds: 7 * 24 * 60 * 60,
    isData: (data): data is NotificationDataByType["PHOTO_HIDDEN"] => hasStringFields(data, "eventId", "photoId"),
    dedupeKey: (userId, { photoId }) => `photo_hidden:${photoId}:${userId}`,
    render: ({ eventId }, locale) => ({
      ...PHOTO_HIDDEN_COPY[locale],
      url: `/events/${eventId}/reports`,
    }),
  },
  PHOTO_REMOVED: {
    required: true,
    channel: "account",
    isData: (data): data is NotificationDataByType["PHOTO_REMOVED"] => hasStringFields(data, "eventId", "photoId"),
    dedupeKey: (userId, { photoId }) => `photo_removed:${photoId}:${userId}`,
    render: ({ eventId }, locale) => ({
      ...PHOTO_REMOVED_COPY[locale],
      url: `/events/${eventId}`,
    }),
  },
  MEMBER_REMOVED: {
    required: true,
    channel: "account",
    isData: (data): data is NotificationDataByType["MEMBER_REMOVED"] =>
      hasStringFields(data, "eventId", "reportId"),
    dedupeKey: (userId, { eventId, reportId }) => `member_removed:${eventId}:${reportId}:${userId}`,
    render: ({ eventId }, locale) => ({
      ...MEMBER_REMOVED_COPY[locale],
      url: `/events/${eventId}`,
    }),
  },
};

/** The entry for a type, with its data as stored: check it with `isData` before rendering. */
export const notificationDefinitionOf = (type: NotificationType): NotificationDefinition<unknown> =>
  NOTIFICATION_CATALOGUE[type] as unknown as NotificationDefinition<unknown>;
