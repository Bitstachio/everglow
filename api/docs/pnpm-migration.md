# Migrating the API from npm to pnpm

This guide is for teammates pulling the branch that switches **`/api`** from npm to pnpm.

**Scope:** `api/` (lockfile, CI, Dockerfile, local setup). `mobile/` already uses pnpm.

---

## Why we switched

- Same package manager as `mobile/` (pnpm 11.25.0)
- Faster, more reproducible installs via pnpm’s content-addressable store
- Smaller disk usage across projects

We are **not** setting up a repo-wide pnpm workspace. `api/` and `mobile/` each keep their own lockfile and `pnpm-workspace.yaml`.

---

## Isolated linking (default)

Unlike mobile, the API keeps pnpm’s default **`isolated`** linker. NestJS and Prisma do not need the Expo/Metro/CocoaPods path layout that forced `nodeLinker: hoisted` on mobile. No `nodeLinker` entry in `api/pnpm-workspace.yaml` means isolated.

### Why `pnpm-workspace.yaml` if we are not a monorepo?

On **pnpm 11+**, project settings (including `allowBuilds`) live in **`pnpm-workspace.yaml`**, not `.npmrc`. Auth/registry settings still belong in `.npmrc`.

---

## What changed in this migration

| Change                                            | Purpose                                                                 |
| ------------------------------------------------- | ----------------------------------------------------------------------- |
| Removed `api/package-lock.json`                   | npm lockfile must not coexist with pnpm                                 |
| Added `api/pnpm-lock.yaml`                        | Commit and use this lockfile going forward                              |
| Added `api/pnpm-workspace.yaml`                   | pnpm 11+ settings (`allowBuilds` for Prisma and related postinstalls)   |
| `openapi:check` and docs/scripts use `pnpm run …` | Avoid hardcoded `npm`                                                   |
| CI API job and `api/Dockerfile`                   | Install with pnpm 11.25.0                                               |
| `scripts/setup-local.mjs`                         | Uses `pnpm install --frozen-lockfile` and checks `pnpm-lock.yaml`       |
| Exact pins for lint/format/test tooling           | Keeps Prettier, ESLint, Jest, and `@nestjs/swagger` on the npm lock versions so CI and OpenAPI stay stable |

A fresh `pnpm install` against caret ranges floated Prettier, `typescript-eslint`, and `@nestjs/swagger`, which broke format/lint and changed `openapi.json`. Those packages are pinned to the versions from the last npm lockfile.

---

## One-time local setup (after pulling)

### 1. Install pnpm

Preferred (uses Node’s Corepack):

```bash
corepack enable
corepack prepare pnpm@11.25.0 --activate
pnpm --version
```

### 2. Clean old npm install and install with pnpm

From `api/`:

```bash
rm -rf node_modules
rm -f package-lock.json
pnpm install
```

Do **not** run `npm install` in `api/` after this migration.

### 3. Continue as usual

```bash
pnpm run setup:local
pnpm run start:dev
```

---

## Day-to-day commands

| Task            | Use                                    |
| --------------- | -------------------------------------- |
| Install deps    | `pnpm install`                         |
| Add a dependency| `pnpm add <pkg>` / `pnpm add -D <pkg>` |
| Run a script    | `pnpm run <script>` or `pnpm <script>` |
| Exec a binary   | `pnpm exec <bin>` (prefer over `npx`)  |

---

## Important conventions

1. **One package manager in `api/`:** only commit `pnpm-lock.yaml`. Never reintroduce `package-lock.json` here.
2. **Keep isolated linking** unless a Nest/Prisma tooling issue forces a change; do not copy mobile’s `nodeLinker: hoisted` without a reason.
3. **Approve new build scripts consciously:** if install warns about ignored builds, run `pnpm approve-builds` and commit the allowlist in `pnpm-workspace.yaml`.
