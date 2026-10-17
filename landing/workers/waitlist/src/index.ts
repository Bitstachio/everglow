export type Env = {
  RESEND_API_KEY: string;
  RESEND_SEGMENT_ID: string;
  /** Comma-separated origins allowed to call this worker. */
  ALLOWED_ORIGINS?: string;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const defaultOrigins = [
  "https://everglow.social",
  "https://www.everglow.social",
  "http://localhost:3000",
  "http://localhost:3001",
];

const parseOrigins = (value: string | undefined) =>
  (value ?? defaultOrigins.join(","))
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

const corsHeaders = (origin: string | null, allowed: string[]) => {
  const allowOrigin = origin && allowed.includes(origin) ? origin : (allowed[0] ?? "*");
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
};

const json = (body: unknown, status: number, headers: HeadersInit) => Response.json(body, { status, headers });

const isDuplicateContact = (status: number, message: string) => status === 409 || /already|exist/i.test(message);

/** Thin proxy: validate email, create a Resend contact in the waitlist segment. */
const handler = {
  async fetch(request: Request, env: Env): Promise<Response> {
    const allowed = parseOrigins(env.ALLOWED_ORIGINS);
    const origin = request.headers.get("Origin");
    const cors = corsHeaders(origin, allowed);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    if (request.method !== "POST") {
      return json({ error: "method_not_allowed" }, 405, cors);
    }

    if (origin && !allowed.includes(origin)) {
      return json({ error: "forbidden" }, 403, cors);
    }

    if (!env.RESEND_API_KEY || !env.RESEND_SEGMENT_ID) {
      return json({ error: "misconfigured" }, 500, cors);
    }

    let body: { email?: unknown };
    try {
      body = await request.json();
    } catch {
      return json({ error: "invalid_json" }, 400, cors);
    }

    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!EMAIL_RE.test(email)) {
      return json({ error: "invalid_email" }, 400, cors);
    }

    const resendResponse = await fetch("https://api.resend.com/contacts", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email,
        unsubscribed: false,
        segments: [{ id: env.RESEND_SEGMENT_ID }],
      }),
    });

    if (resendResponse.ok) {
      return json({ ok: true }, 200, cors);
    }

    const payload = (await resendResponse.json().catch(() => null)) as {
      message?: string;
    } | null;
    const message = payload?.message ?? "";

    // Duplicate signup is fine — treat as success so the form stays quiet.
    if (isDuplicateContact(resendResponse.status, message)) {
      return json({ ok: true }, 200, cors);
    }

    console.error("resend_error", resendResponse.status, payload);
    return json({ error: "upstream" }, 502, cors);
  },
};

export default handler;
