# Migrating mobile from npm to pnpm

This guide is for teammates pulling the branch that switches **`/mobile`** from npm to pnpm.

**Scope:** `mobile/` only. `api/` stays on npm for now — keep using `npm` there.

---

## Why we switched

- Faster, more reproducible installs via pnpm’s content-addressable store
- Smaller disk usage across projects
- Stricter dependency handling than npm’s flat tree (with an Expo-friendly layout — see below)

We are **not** setting up a repo-wide pnpm workspace yet. When/if we add a web client that shares packages with mobile, a monorepo workspace becomes more useful. Backend (`api/`) can stay separate until that matters.

---

## Hoisting (`nodeLinker: hoisted`) — pragmatic, not purist

pnpm’s default linker is **`isolated`**: a strict, non-flat layout under `node_modules/.pnpm` with symlinks. That is the “proper” pnpm model (stricter deps, less phantom dependencies).

For this Expo / React Native app, **isolated linking did not work reliably**:

- CocoaPods / Xcode scripts expected npm-style paths like `node_modules/react-native/...`
- Metro could not resolve NativeWind’s `react-native-css-interop/jsx-runtime`
- Native modules were missing or pointed at stale `.pnpm/...` paths after installs

So we set **`nodeLinker: hoisted`**, which produces a flatter, npm-like `node_modules`. Expo documents this as the fallback when isolated installs break native tooling.

**This is not the perfect pnpm-purist approach.** We lose some of isolated linking’s strictness in exchange for a working iOS/Android/Metro toolchain. We keep it for now until Expo/RN (or our own tooling) supports isolated layouts cleanly; revisiting and dropping hoisting later is a reasonable future goal.

### Why `pnpm-workspace.yaml` instead of `.npmrc`?

On **pnpm 11+**, `.npmrc` is for **auth and registry settings only**. Other project settings (including `nodeLinker`) are **ignored** if put in `.npmrc`.

They belong in **`pnpm-workspace.yaml`** (or the global pnpm config). That is why this single-package app still has a `pnpm-workspace.yaml`: it is the config file for pnpm 11, not because we are a multi-package monorepo.

Do **not** put `node-linker=hoisted` in `.npmrc` — it will look correct and do nothing, and you will get isolated installs again.

---

## What changed in this migration

| Change | Purpose |
| --- | --- |
| Removed `mobile/package-lock.json` | npm lockfile must not coexist with pnpm |
| Added `mobile/pnpm-lock.yaml` | Commit and use this lockfile going forward |
| Added `mobile/pnpm-workspace.yaml` | pnpm 11+ project settings live here (not `.npmrc`). Includes `nodeLinker: hoisted` and `allowBuilds`. See the hoisting section above. |
| `nodeLinker: hoisted` | Flat/npm-like `node_modules` so Expo, Metro, and CocoaPods work. Not the purist isolated default — temporary pragmatic choice (details above). |
| `allowBuilds` for `browser-tabs-lock` / `unrs-resolver` | Approves dependency lifecycle scripts (pnpm blocks them by default) |
| `openapi:check` script now calls `pnpm run …` | Avoid hardcoded `npm` in package scripts |
| `react-native-reanimated`: `^4.1.5` → `^4.1.7` | Fresh lockfile had floated Reanimated to 4.6.x (needs Worklets 0.12.x). Expo SDK 54 expects ~4.1.x with Worklets `0.5.1`. Re-pinned with `expo install`. |

**Not done yet (follow-ups):**

- `mobile/README.md` and some docs still mention `npm install` / `npm run …`

`api/` CI and lockfile are intentionally untouched.

---

## One-time local setup (after pulling)

### 1. Install pnpm

Preferred (uses Node’s Corepack):

```bash
corepack enable
corepack prepare pnpm@11.25.0 --activate
pnpm --version
```

Or:

```bash
npm install -g pnpm
```

### 2. Clean old npm install and install with pnpm

From `mobile/`:

```bash
rm -rf node_modules
# If an old package-lock.json somehow reappears, delete it too:
rm -f package-lock.json

pnpm install
```

Do **not** run `npm install` in `mobile/` after this migration.

### 3. iOS native deps (required)

If you previously ran `pod install` under **isolated** pnpm, CocoaPods will still point at stale `node_modules/.pnpm/...` paths. You must regenerate pods after switching to hoisted:

```bash
cd ios
rm -rf Pods Podfile.lock build
pod install
cd ..
```

Use `pod install --repo-update` if CocoaPods cannot find a pod version (e.g. Auth0 after `react-native-auth0` bumps).

If Xcode still fails with Hermes / `with-environment.sh` errors, also clear DerivedData:

```bash
rm -rf ~/Library/Developer/Xcode/DerivedData/everglowmobile-*
```

### 4. Smoke-check

```bash
pnpm run lint
pnpm exec tsc --noEmit
pnpm start
# or
pnpm run ios
```

---

## Day-to-day commands

| Task | Use |
| --- | --- |
| Install deps | `pnpm install` |
| Add a dependency | `pnpm add <pkg>` |
| Add an Expo-compatible native dep | `pnpm exec expo install <pkg>` |
| Run a script | `pnpm run <script>` or `pnpm <script>` |
| Exec a binary | `pnpm exec <bin>` (prefer over `npx` in this package) |
| Lint / format / OpenAPI | `pnpm run lint`, `pnpm run format`, `pnpm run openapi:generate` |

**`api/`:** still `npm install` / `npm run …` as before.

---

## Important conventions

1. **One package manager in `mobile/`** — only commit `pnpm-lock.yaml`. Never reintroduce `package-lock.json` here.
2. **Keep `nodeLinker: hoisted` in `pnpm-workspace.yaml`** — required for Expo/RN/Metro today. Do **not** move it to `.npmrc` (ignored on pnpm 11). Prefer leaving this as-is until isolated linking works for our stack.
3. **Prefer `expo install` for Expo/RN packages** — avoids caret ranges floating past Expo SDK–compatible versions (what happened with Reanimated).
4. **Approve new build scripts consciously** — if install warns about ignored builds, run `pnpm approve-builds` and commit the resulting allowlist change (`pnpm-workspace.yaml` / related config).

---

## Troubleshooting

### iOS: “Build input file cannot be found … node_modules/…”

Usually means `node_modules` isn’t hoisted or is a leftover isolated install.

```bash
# confirm (pnpm 11+)
grep nodeLinker pnpm-workspace.yaml   # should be: nodeLinker: hoisted

rm -rf node_modules
pnpm install
cd ios && rm -rf Pods Podfile.lock build && pod install && cd ..
```

### iOS: Hermes script — `with-environment.sh: No such file or directory` (path contains `.pnpm/`)

CocoaPods was generated under isolated linking and still references `node_modules/.pnpm/react-native@.../`. Regenerate pods (see step 3 above), then rebuild.

### Pod install: Worklets incompatible with Reanimated

Align with Expo SDK 54:

```bash
pnpm exec expo install react-native-reanimated react-native-worklets
cd ios && rm -rf Pods Podfile.lock build && pod install && cd ..
```

### Pod install: cannot find Auth0 (or similar) pod version

```bash
cd ios
pod install --repo-update
```

### Metro: Unable to resolve `react-native-css-interop/jsx-runtime`

NativeWind’s Babel `jsxImportSource` needs `react-native-css-interop` at the project root. That fails under isolated linking.

```bash
grep nodeLinker pnpm-workspace.yaml   # must be hoisted
rm -rf node_modules
pnpm install
# restart Expo with a clean cache if needed:
pnpm exec expo start -c
```

### Accidentally ran `npm install` in mobile

```bash
rm -rf node_modules package-lock.json
pnpm install
```

---

## FAQ

**Do I need a monorepo / root pnpm workspace?**  
No. This is a standalone pnpm project under `mobile/`.

**Is `nodeLinker: hoisted` “pure” pnpm?**  
No. Isolated linking is the purist default. Hoisting is a deliberate compatibility tradeoff for Expo/RN until isolated installs work for us without Metro/CocoaPods breakage. Config goes in `pnpm-workspace.yaml` (pnpm 11+), not `.npmrc`.

**Why do we have `pnpm-workspace.yaml` if we are not a monorepo?**  
pnpm 11 stores project settings there. Ours mainly holds `nodeLinker: hoisted` and `allowBuilds`.

**Will `api/` move to pnpm?**  
Not in this change. We can migrate later without blocking mobile.
