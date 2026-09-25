import { getErrorCode, isApiError } from "@/lib/api/errors";
import { useEffect, useMemo, useRef, useState } from "react";
import { checkUsernameAvailability } from "../api/queries";
import {
  isUsernameFormatValid,
  normalizeUsername,
  usernameAvailabilityMessage,
  type UsernameAvailabilityReason,
  type UsernameAvailabilityState,
} from "../lib/username";

export const USERNAME_AVAILABILITY_DEBOUNCE_MS = 300;

export type { UsernameAvailabilityState, UsernameAvailabilityStatus } from "../lib/username";

type UseUsernameAvailabilityOptions = {
  /** When the candidate matches this (normalized), skip the network check. */
  currentUsername?: string;
  debounceMs?: number;
};

type RemoteResult = {
  username: string;
  available: boolean;
  reason: UsernameAvailabilityReason | null;
};

const idleState = (username = ""): UsernameAvailabilityState => ({
  status: "idle",
  username,
  reason: null,
  message: null,
  canSubmit: false,
});

const deriveLocalState = (rawUsername: string, currentUsername?: string): UsernameAvailabilityState | null => {
  const normalized = normalizeUsername(rawUsername);
  const owned = currentUsername ? normalizeUsername(currentUsername) : "";

  if (!normalized) return idleState();

  if (owned && normalized === owned) {
    return {
      status: "available",
      username: normalized,
      reason: null,
      message: null,
      canSubmit: true,
    };
  }

  if (!isUsernameFormatValid(normalized)) {
    return {
      status: "unavailable",
      username: normalized,
      reason: "INVALID_FORMAT",
      message: usernameAvailabilityMessage("INVALID_FORMAT"),
      canSubmit: false,
    };
  }

  return null;
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
  const normalized = normalizeUsername(rawUsername);
  const localState = useMemo(() => deriveLocalState(rawUsername, currentUsername), [rawUsername, currentUsername]);
  const [remote, setRemote] = useState<RemoteResult | null>(null);
  const [pausedUntil, setPausedUntil] = useState(0);
  const [clock, setClock] = useState(() => Date.now());
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (localState) return;

    const now = Date.now();
    if (now < pausedUntil) {
      const wake = setTimeout(() => setClock(Date.now()), pausedUntil - now);
      return () => clearTimeout(wake);
    }

    const requestId = ++requestIdRef.current;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const result = await checkUsernameAvailability(normalized, controller.signal);
          if (requestId !== requestIdRef.current) return;
          setRemote({
            username: result.username,
            available: result.available,
            reason: (result.reason ?? null) as UsernameAvailabilityReason | null,
          });
        } catch (error) {
          if (controller.signal.aborted || requestId !== requestIdRef.current) return;
          if (getErrorCode(error) === "RATE_LIMIT_EXCEEDED") {
            const retryAfterSeconds = isApiError(error) ? (error.retryAfterSeconds ?? 60) : 60;
            const until = Date.now() + retryAfterSeconds * 1000;
            setPausedUntil(until);
            setClock(Date.now());
            setRemote(null);
            return;
          }
          setRemote({
            username: normalized,
            available: false,
            reason: null,
          });
        }
      })();
    }, debounceMs);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [localState, normalized, debounceMs, pausedUntil, clock]);

  if (localState) return localState;

  if (clock < pausedUntil) {
    return {
      status: "paused",
      username: normalized,
      reason: null,
      message: "Too many checks. Try again in a moment.",
      canSubmit: false,
    };
  }

  if (remote && remote.username === normalized) {
    if (remote.available) {
      return {
        status: "available",
        username: remote.username,
        reason: null,
        message: "Username is available",
        canSubmit: true,
      };
    }
    if (remote.reason) {
      return {
        status: "unavailable",
        username: remote.username,
        reason: remote.reason,
        message: usernameAvailabilityMessage(remote.reason) ?? "This username is unavailable",
        canSubmit: false,
      };
    }
    return {
      status: "unavailable",
      username: remote.username,
      reason: null,
      message: "Could not check availability. Please try again.",
      canSubmit: false,
    };
  }

  return {
    status: "checking",
    username: normalized,
    reason: null,
    message: "Checking availability…",
    canSubmit: false,
  };
};
