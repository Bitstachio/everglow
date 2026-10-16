# Everglow Landing

Marketing site for Everglow. Next.js with static export (`output: "export"`). Production host: [everglow.social](https://everglow.social) via GitHub Pages.

## Scripts

```bash
pnpm install
pnpm dev      # http://localhost:3000
pnpm build    # static output in out/
pnpm lint
```

## Deploy (GitHub Pages)

Pushes to `main` that touch `landing/**` run [`.github/workflows/deploy-landing.yml`](../.github/workflows/deploy-landing.yml). Manual runs: Actions → **Deploy landing to Pages** → **Run workflow**.

`basePath` and `assetPrefix` stay empty because the site is served at the apex custom domain, not under `/everglow`.

### One-time repo settings

1. **Settings → Pages → Build and deployment → Source**: GitHub Actions.
2. **Settings → Pages → Custom domain**: `everglow.social` (saves a `CNAME`; this repo also keeps `landing/public/CNAME` so deploys do not wipe it).
3. After DNS verifies, enable **Enforce HTTPS**.

### DNS (`everglow.social`)

At your registrar (or DNS host), point the apex at GitHub Pages. Use **all** of the `A` and `AAAA` rows, **or** a single `ALIAS`/`ANAME` if your provider supports it. Do **not** put a `CNAME` on the apex.

| Host                | Type    | Value                  |
| ------------------- | ------- | ---------------------- |
| `@` (apex)          | `A`     | `185.199.108.153`      |
| `@`                 | `A`     | `185.199.109.153`      |
| `@`                 | `A`     | `185.199.110.153`      |
| `@`                 | `A`     | `185.199.111.153`      |
| `@`                 | `AAAA`  | `2606:50c0:8000::153`  |
| `@`                 | `AAAA`  | `2606:50c0:8001::153`  |
| `@`                 | `AAAA`  | `2606:50c0:8002::153`  |
| `@`                 | `AAAA`  | `2606:50c0:8003::153`  |
| `www` (recommended) | `CNAME` | `bitstachio.github.io` |

Alternative for apex only: one `ALIAS` or `ANAME` of `@` → `bitstachio.github.io` (Cloudflare “CNAME flattening” counts).

Propagation can take minutes to hours. Check with:

```bash
dig everglow.social +noall +answer
dig www.everglow.social +noall +answer
```

You should see the GitHub Pages A/AAAA set (or an ALIAS target of `bitstachio.github.io`). Then re-check **Settings → Pages** until the domain shows as verified and HTTPS can be enforced.

Official reference: [Managing a custom domain for GitHub Pages](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site).

### Build-time env (waitlist)

The CTA form posts `{ "email" }` to `NEXT_PUBLIC_WAITLIST_URL`. Set that as a **GitHub Actions repository variable** (Settings → Secrets and variables → Actions → Variables) once the Cloudflare Worker below is live. Until then the form still renders and shows a quiet “not open yet” message on submit.

Local override: put `NEXT_PUBLIC_WAITLIST_URL=http://127.0.0.1:8787` in `landing/.env.local` while running `pnpm --dir workers/waitlist dev`.

## Waitlist (Resend + Cloudflare Worker)

GitHub Pages is static, so the Resend API key cannot live in the Next bundle. A small worker in [`workers/waitlist/`](./workers/waitlist/) accepts the form POST and creates a Resend contact in a launch waitlist **segment**.

Email only — no name or phone. That keeps the form short and matches what we need for a launch notice.

### 1. Resend dashboard

1. Create a [Resend](https://resend.com) account (or sign in).
2. **API Keys** → create a key with permission to manage contacts. Copy it once; it is `RESEND_API_KEY`.
3. **Contacts → Segments** → create a segment named e.g. `Launch waitlist`. Open it and copy the segment id (`seg_…`). That is `RESEND_SEGMENT_ID`.
4. (Optional, for later) Verify a sending domain under **Domains** so you can broadcast to this segment when Everglow launches. Collecting contacts does not require a verified domain.

You do **not** need Resend to email you on each signup. Contacts land in the segment; open **Contacts** in the dashboard (or export) to see who joined. If you want an inbox ping per signup, add that later with a Resend webhook or a second `emails.send` call in the worker.

### 2. Deploy the worker

```bash
cd landing/workers/waitlist
pnpm install
# paste the segment id into wrangler.toml [vars].RESEND_SEGMENT_ID
pnpm exec wrangler login
pnpm exec wrangler secret put RESEND_API_KEY   # paste the API key when prompted
pnpm deploy
```

Note the worker URL Wrangler prints (e.g. `https://everglow-waitlist.<account>.workers.dev`). You can later attach a custom route like `https://waitlist.everglow.social` in the Cloudflare dashboard.

Local smoke test:

```bash
pnpm --dir landing/workers/waitlist dev
curl -i -X POST http://127.0.0.1:8787 \
  -H 'Content-Type: application/json' \
  -H 'Origin: http://localhost:3000' \
  -d '{"email":"you@example.com"}'
```

### 3. Point the landing page at the worker

1. GitHub repo → **Settings → Secrets and variables → Actions → Variables**.
2. Add `NEXT_PUBLIC_WAITLIST_URL` = the worker URL (no trailing slash).
3. Redeploy the landing site (push to `main` that touches `landing/`, or run **Deploy landing to Pages**).

### Worker env summary

| Name                       | Where                                        | Purpose                                                        |
| -------------------------- | -------------------------------------------- | -------------------------------------------------------------- |
| `RESEND_API_KEY`           | Cloudflare Worker secret                     | Server-side Resend auth                                        |
| `RESEND_SEGMENT_ID`        | Worker `wrangler.toml` `[vars]`              | Waitlist segment to add contacts to                            |
| `ALLOWED_ORIGINS`          | Worker `[vars]`                              | CORS allow-list (defaults include everglow.social + localhost) |
| `NEXT_PUBLIC_WAITLIST_URL` | GitHub Actions variable + local `.env.local` | Browser POST target (public URL only)                          |

## Notes

- Scope is this folder only; it does not talk to the API or mobile app.
- `next-intl` is wired with English as the starting locale. Add locales under `src/messages/` when needed. Middleware does not run on GitHub Pages; locale routes come from the static `out/` files.
- TypeScript and React conventions: [docs/code-conventions.md](./docs/code-conventions.md).
- Shared product docs (auth, uploads, event quotas, …): [../docs/](../docs/).
