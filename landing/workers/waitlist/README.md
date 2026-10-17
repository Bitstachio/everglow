# Waitlist worker

Tiny Cloudflare Worker that accepts `{ "email": "…" }` and creates a Resend contact in the Everglow launch waitlist segment. The static landing page posts here; `RESEND_API_KEY` never ships to the browser.

See [../../README.md](../../README.md#waitlist-resend--cloudflare-worker) for the full Resend + deploy setup.
