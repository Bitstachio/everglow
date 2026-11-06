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
