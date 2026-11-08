import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ExpoPushMessage, ExpoPushReceipt, ExpoPushTicket } from "./expo-push.types";

const SEND_URL = "https://exp.host/--/api/v2/push/send";
const RECEIPTS_URL = "https://exp.host/--/api/v2/push/getReceipts";
const REQUEST_TIMEOUT_MS = 10_000;

/** Expo takes at most this many messages per send request. */
export const EXPO_MAX_MESSAGES_PER_REQUEST = 100;
/** And at most this many ticket ids per receipt request. */
export const EXPO_MAX_RECEIPT_IDS_PER_REQUEST = 1000;

/**
 * The whole request failed (network, timeout, 4xx/5xx, malformed answer), so
 * nothing in it is known to have been sent. `status` is the HTTP status, or
 * null when no response arrived. `retryAfterSeconds` is Expo's Retry-After,
 * when it sent one.
 */
export class ExpoPushRequestError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly retryAfterSeconds: number | null = null,
  ) {
    super(message);
    this.name = "ExpoPushRequestError";
  }
}

/** Retry-After as seconds from now: either delta-seconds or an HTTP date. Null when absent or unreadable. */
export const parseRetryAfter = (header: string | null, now: number = Date.now()): number | null => {
  if (!header) return null;
  const trimmed = header.trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed);
  const at = Date.parse(trimmed);
  return Number.isNaN(at) ? null : Math.max(0, Math.ceil((at - now) / 1000));
};

/**
 * The Expo Push API (https://docs.expo.dev/push-notifications/sending-notifications/).
 * Plain HTTP: no SDK dependency for two endpoints. EXPO_ACCESS_TOKEN is sent
 * when set, which Expo requires once "enhanced push security" is on for the
 * project. Callers chunk; this sends what it is given in one request.
 */
@Injectable()
export class ExpoPushService {
  constructor(private readonly configService: ConfigService) {}

  async send(messages: ExpoPushMessage[]): Promise<ExpoPushTicket[]> {
    if (messages.length === 0) return [];
    const tickets = await this.post<ExpoPushTicket[]>(SEND_URL, messages);
    if (!Array.isArray(tickets) || tickets.length !== messages.length) {
      throw new ExpoPushRequestError("Expo answered with a different number of tickets than messages", 200);
    }
    return tickets;
  }

  async getReceipts(ticketIds: string[]): Promise<Record<string, ExpoPushReceipt>> {
    if (ticketIds.length === 0) return {};
    const receipts = await this.post<Record<string, ExpoPushReceipt>>(RECEIPTS_URL, { ids: ticketIds });
    if (!receipts || typeof receipts !== "object") {
      throw new ExpoPushRequestError("Expo answered receipts without a data object", 200);
    }
    return receipts;
  }

  private async post<T>(url: string, body: unknown): Promise<T> {
    const accessToken = this.configService.get<string>("notifications.expoAccessToken");
    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Accept-Encoding": "gzip, deflate",
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      throw new ExpoPushRequestError(`Expo push request failed: ${(error as Error).message}`, null);
    }

    let parsed: { data?: T; errors?: { code?: string; message?: string }[] };
    try {
      parsed = (await response.json()) as typeof parsed;
    } catch {
      throw new ExpoPushRequestError(
        `Expo push answered ${response.status} without JSON`,
        response.status,
        parseRetryAfter(response.headers.get("retry-after")),
      );
    }
    if (!response.ok || parsed.errors?.length || parsed.data === undefined) {
      const first = parsed.errors?.[0];
      throw new ExpoPushRequestError(
        `Expo push answered ${response.status}${first?.code ? ` ${first.code}` : ""}`,
        response.status,
        parseRetryAfter(response.headers.get("retry-after")),
      );
    }
    return parsed.data;
  }
}
