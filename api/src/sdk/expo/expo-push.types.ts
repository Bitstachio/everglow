/** One push to one phone, as the Expo Push API takes it. */
export interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  /** Read by the app when the notification is tapped. */
  data: Record<string, string>;
  sound?: "default" | null;
  /** Android channel; the app creates one per kind of notification. */
  channelId?: string;
  /** Seconds Apple and Google keep trying a phone that is off. Unset: the platforms' default. */
  ttl?: number;
}

/** Expo's answer per message, in the order sent. */
export type ExpoPushTicket =
  | { status: "ok"; id: string }
  | { status: "error"; message: string; details?: { error?: string } };

/** What Apple or Google said, looked up by ticket id some minutes later. */
export type ExpoPushReceipt = { status: "ok" } | { status: "error"; message: string; details?: { error?: string } };

/** The phone uninstalled the app or turned the token off: stop sending to it. */
export const EXPO_DEVICE_NOT_REGISTERED = "DeviceNotRegistered";

/**
 * Apple or Google refused our push credentials (APNs key or FCM server
 * credentials uploaded to Expo): every push on that platform fails until
 * they are fixed.
 */
export const EXPO_CREDENTIAL_ERRORS: readonly string[] = ["InvalidCredentials", "MismatchSenderId"];

/** Too many messages to this one phone too fast: try again later. */
export const EXPO_MESSAGE_RATE_EXCEEDED = "MessageRateExceeded";
