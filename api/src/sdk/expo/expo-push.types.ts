/** One push to one phone, as the Expo Push API takes it. */
export interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  /** Read by the app when the notification is tapped. */
  data: Record<string, string>;
  sound?: "default" | null;
  /** Android channel; the app creates "default". */
  channelId?: string;
}

/** Expo's answer per message, in the order sent. */
export type ExpoPushTicket =
  | { status: "ok"; id: string }
  | { status: "error"; message: string; details?: { error?: string } };

/** What Apple or Google said, looked up by ticket id some minutes later. */
export type ExpoPushReceipt = { status: "ok" } | { status: "error"; message: string; details?: { error?: string } };

/** The phone uninstalled the app or turned the token off: stop sending to it. */
export const EXPO_DEVICE_NOT_REGISTERED = "DeviceNotRegistered";
