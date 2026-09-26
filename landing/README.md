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

| Host | Type | Value |
| --- | --- | --- |
| `@` (apex) | `A` | `185.199.108.153` |
| `@` | `A` | `185.199.109.153` |
| `@` | `A` | `185.199.110.153` |
| `@` | `A` | `185.199.111.153` |
| `@` | `AAAA` | `2606:50c0:8000::153` |
| `@` | `AAAA` | `2606:50c0:8001::153` |
| `@` | `AAAA` | `2606:50c0:8002::153` |
| `@` | `AAAA` | `2606:50c0:8003::153` |
| `www` (recommended) | `CNAME` | `bitstachio.github.io` |

Alternative for apex only: one `ALIAS` or `ANAME` of `@` → `bitstachio.github.io` (Cloudflare “CNAME flattening” counts).

Propagation can take minutes to hours. Check with:

```bash
dig everglow.social +noall +answer
dig www.everglow.social +noall +answer
```

You should see the GitHub Pages A/AAAA set (or an ALIAS target of `bitstachio.github.io`). Then re-check **Settings → Pages** until the domain shows as verified and HTTPS can be enforced.

Official reference: [Managing a custom domain for GitHub Pages](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site).

### Build-time env (optional)

When a production waitlist endpoint exists, set the repo Actions variable `NEXT_PUBLIC_WAITLIST_URL` so the static build can post signups. Until then the variable may be empty.

## Notes

- Scope is this folder only; it does not talk to the API or mobile app.
- `next-intl` is wired with English as the starting locale. Add locales under `src/messages/` when needed. Middleware does not run on GitHub Pages; locale routes come from the static `out/` files.
- TypeScript and React conventions: [docs/code-conventions.md](./docs/code-conventions.md).
