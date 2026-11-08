/**
 * The most phones one account keeps registered. Registering another drops the
 * one seen least recently: a person rarely has more, and a cap keeps one
 * account from collecting push tokens without bound.
 */
export const MAX_DEVICES_PER_USER = 10;

/**
 * The shape of an Expo push token. Checked before storing so a typo or a raw
 * APNs/FCM token is a 400 here, not a failed send later.
 */
export const EXPO_PUSH_TOKEN_PATTERN = /^Expo(nent)?PushToken\[[A-Za-z0-9_-]{1,200}\]$/;

/**
 * Sender passes one notification gets before it is FAILED and reported. With
 * the backoff below, the 8th and last pass comes about 2 hours after the
 * first (1 + 2 + 4 + 8 + 16 + 32 + 60 minutes), so an Expo outage or a
 * credential fixed within that window loses nothing.
 */
export const DEFAULT_NOTIFICATION_MAX_ATTEMPTS = 8;

/** Days a notification is kept, sent or not, before it and its deliveries are deleted. */
export const DEFAULT_NOTIFICATION_RETENTION_DAYS = 90;

/**
 * Days without a registration after which a phone is dropped. The app
 * registers on every launch, and FCM treats a token unused for 270 days as
 * stale, so this matches it.
 */
export const DEFAULT_NOTIFICATION_DEVICE_STALE_DAYS = 270;

/** Notifications one sender batch claims. Each user has at most MAX_DEVICES_PER_USER phones. */
export const NOTIFICATION_SEND_BATCH_SIZE = 50;

/** Batches one sender run handles before leaving the rest to the next run. */
export const NOTIFICATION_SEND_MAX_BATCHES_PER_RUN = 20;

/** How long a sender pass holds the notifications it claimed. Longer than any send. */
export const NOTIFICATION_CLAIM_LEASE_SECONDS = 300;

/**
 * First retry after this many seconds, doubling per attempt up to the cap. A
 * Retry-After from Expo is honoured up to the same cap.
 */
export const NOTIFICATION_RETRY_BASE_SECONDS = 60;
export const NOTIFICATION_RETRY_MAX_SECONDS = 3600;

/**
 * Expo keeps receipts for about a day and has them ready after a few minutes.
 * Checked between these ages; a ticket never checked in that window stays
 * TICKETED.
 */
export const NOTIFICATION_RECEIPT_MIN_AGE_MINUTES = 15;
export const NOTIFICATION_RECEIPT_MAX_AGE_HOURS = 24;
