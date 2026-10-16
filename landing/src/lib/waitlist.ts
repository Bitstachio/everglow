const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const WAITLIST_URL = process.env.NEXT_PUBLIC_WAITLIST_URL?.trim() ?? "";

export const isValidEmail = (value: string) => EMAIL_RE.test(value.trim());

export type WaitlistSubmitResult =
  { ok: true } | { ok: false; reason: "invalid_email" | "not_configured" | "network" | "upstream" };

/** POST `{ email }` to the waitlist worker. Secrets stay on the worker. */
export const submitWaitlistEmail = async (email: string): Promise<WaitlistSubmitResult> => {
  const trimmed = email.trim().toLowerCase();
  if (!isValidEmail(trimmed)) {
    return { ok: false, reason: "invalid_email" };
  }

  if (!WAITLIST_URL) {
    return { ok: false, reason: "not_configured" };
  }

  try {
    const response = await fetch(WAITLIST_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: trimmed }),
    });

    if (!response.ok) {
      return { ok: false, reason: "upstream" };
    }

    return { ok: true };
  } catch {
    return { ok: false, reason: "network" };
  }
};
