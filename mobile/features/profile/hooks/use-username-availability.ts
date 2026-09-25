import { usersControllerCheckUsernameAvailability } from "@/lib/api/generated";
import { unwrapEnvelope } from "@/lib/api/envelope";
import { ApiError, getErrorCode } from "@/lib/api/errors";
import { useEffect, useRef, useState } from "react";
import {
  isUsernameFormatValid,
  normalizeUsername,
  usernameAvailabilityMessage,
  type UsernameAvailabilityReason,
} from "../lib/username";

export const USERNAME_AVAILABILITY_DEBOUNCE_MS = 300;

export type UsernameAvailabilityStatus = "idle" | "checking" | "available" | "unavailable" | "paused";

export type UsernameAvailabilityState = {
  status: UsernameAvailabilityStatus;
  username: string;
  reason: UsernameAvailabilityReason | null;
  message: string | null;
  /** True when the candidate may be submitted (own username or API said available). */
  canSubmit: boolean;
};

const idleState = (username = ""): UsernameAvailabilityState => ({
  status: "idle",
  username,
  reason: null,
  message: null,
  canSubmit: false,
});

type UseUsernameAvailabilityOptions = {
  /** When the candidate matches this (normalized), skip the network check. */
  currentUsername?: string;
  debounceMs?: number;
};

/**
 * Debounced username availability for typing UIs. Skips the network when the
 * format is invalid client-side or the value is the caller's current username.
 * On 429 RATE_LIMIT_EXCEEDED, pauses until Retry-After elapses.
 */
export const useUsernameAvailability = (
  rawUsername: string,
  { currentUsername, debounceMs = USERNAME_AVAILABILITY_DEBOUNCE_MS }: UseUsernameAvailabilityOptions = {},
): UsernameAvailabilityState => {
  const [state, setState] = useState<UsernameAvailabilityState>(idleState);
  const pausedUntilRef = useRef(0);
  const [pauseEpoch, setPauseEpoch] = useState(0);

  useEffect(() => {
    const normalized = normalizeUsername(rawUsername);
    const owned = currentUsername ? normalizeUsername(currentUsername) : "";

    if (!normalized) {
      setState(idleState());
      return;
    }

    if (owned && normalized === owned) {
      setState({
        status: "available",
        username: normalized,
        reason: null,
        message: null,
        canSubmit: true,
      });
      return;
    }

    if (!isUsernameFormatValid(normalized)) {
      setState({
        status: "unavailable",
        username: normalized,
        reason: "INVALID_FORMAT",
        message: usernameAvailabilityMessage("INVALID_FORMAT"),
        canSubmit: false,
      });
      return;
    }

    const now = Date.now();
    if (now < pausedUntilRef.current) {
      const remainingMs = pausedUntilRef.current - now;
      setState({
        status: "paused",
        username: normalized,
        reason: null,
        message: "Too many checks. Try again in a moment.",
        canSubmit: false,
      });
      const wake = setTimeout(() => setPauseEpoch((value) => value + 1), remainingMs);
      return () => clearTimeout(wake);
    }

    setState({
      status: "checking",
      username: normalized,
      reason: null,
      message: "Checking availability…",
      canSubmit: false,
    });

    const controller = new AbortController();
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const { data } = await usersControllerCheckUsernameAvailability({
            query: { username: normalized },
            signal: controller.signal,
            throwOnError: true,
          });
          const result = unwrapEnvelope(data);
          const reason = (result.reason ?? null) as UsernameAvailabilityReason | null;
          if (result.available) {
            setState({
              status: "available",
              username: result.username,
              reason: null,
              message: "Username is available",
              canSubmit: true,
            });
            return;
          }
          setState({
            status: "unavailable",
            username: result.username,
            reason,
            message: usernameAvailabilityMessage(reason) ?? "This username is unavailable",
            canSubmit: false,
          });
        } catch (error) {
          if (controller.signal.aborted) return;
          if (getErrorCode(error) === "RATE_LIMIT_EXCEEDED") {
            const retryAfterSeconds = error instanceof ApiError ? (error.retryAfterSeconds ?? 60) : 60;
            pausedUntilRef.current = Date.now() + retryAfterSeconds * 1000;
            setState({
              status: "paused",
              username: normalized,
              reason: null,
              message: "Too many checks. Try again in a moment.",
              canSubmit: false,
            });
            setPauseEpoch((value) => value + 1);
            return;
          }
          setState({
            status: "unavailable",
            username: normalized,
            reason: null,
            message: "Could not check availability. Please try again.",
            canSubmit: false,
          });
        }
      })();
    }, debounceMs);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [rawUsername, currentUsername, debounceMs, pauseEpoch]);

  return state;
};
