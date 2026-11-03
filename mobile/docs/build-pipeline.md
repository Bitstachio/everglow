# How the mobile app is built and run

This guide is for engineers who know React on the web and are new to React Native / Expo. It explains what happens between TypeScript in `mobile/` and an app running on an iOS simulator or Android emulator, using Everglow’s actual setup.

It is not a substitute for Expo’s own docs. Use it as a map of the moving parts you will hear in PRs, CI, and local debugging.

## Web mental model → native mental model

On the web you ship **HTML + CSS + JS** to a browser that already exists on the user’s machine.

On React Native there is no shared browser. You ship a **real iOS or Android app** (the thing Xcode or Gradle builds into an `.app` / APK). People sometimes call that app the **native host** or **native shell**. “Shell” here only means “the outer native program that wraps your JS,” not a Unix shell.

That native app already _is_ the installed product. It does not “compile your JS into a native app.” Your UI logic stays a JavaScript bundle; the host loads and runs it. Concretely, the host:

1. Is a normal iOS/Android binary, built by Xcode or Gradle from the generated native project (Expo prebuild) plus native code from dependencies. Each React Native app ships its **own** host; phones do not share one system-wide React Native runtime the way they share Safari or Chrome.
2. Owns the OS-facing pieces: process, window, splash screen, permissions, URL callbacks (e.g. Auth0), and similar platform concerns live here, not in your JS.
3. Runs your JS at runtime: it embeds a JS engine (Hermes), loads the bundle on launch, and executes your React tree on the fly. Release builds only change _where_ the bundle is stored (inside the binary instead of served by Metro); they do not turn screens into static native UI ahead of time.
4. Renders by mapping React to native views: as state updates, React Native creates and updates real `UIView` / Android views. This is not a WebView rendering HTML/CSS.
5. Calls native APIs when JS asks: camera, secure storage, Auth0, and similar features go through native modules. That bridge happens on demand while the app runs.

So relative to the web: the **native host plays the role the browser used to play** (provide a runtime and draw UI), but it draws **native controls**, and you must **ship that host** with each app.

```
┌─────────────────────────────────────────────────────────────┐
│  Native host app (UIKit / Android)  ← the installed binary  │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  JS engine (Hermes)                                   │  │
│  │    your React Native / Expo Router app                │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

UI is not a DOM. There is no browser CSS engine. Layout is computed by [Yoga](https://www.yogalayout.dev/) (a Flexbox-like engine React Native uses on every platform), and colors, text, and touches are handled by real native controls. NativeWind still lets us write Tailwind-like `className`s in source; those classes become React Native style values, not CSS stylesheets.

Hermes and Yoga are separate. Hermes runs your JavaScript (React tree, state, event handlers). Yoga only computes layout (sizes and positions) from style props. React Native connects them: JS on Hermes describes a tree of views and their flex/padding/alignment, Yoga figures out the geometry, and native views are updated to match. Hermes does not perform layout, and Yoga does not execute your app logic.

Two pipelines matter, and they are easy to confuse:

| Pipeline         | Rough web analogue                                                                     | What it produces                                                          |
| ---------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| **JS / Metro**   | Vite / webpack bundling your app code                                                  | A JS bundle the native host can execute                                   |
| **Native build** | “Building and installing the browser itself” (there is no shared runtime on the phone) | An `.app` (iOS) or APK/AAB (Android) with native code, assets, and config |

Changing a React screen usually needs only a Metro reload. Changing splash images, fonts registered natively, Auth0 URL schemes, or native modules needs a **native rebuild**.

Auth0 is easy to get wrong here because two different kinds of settings look similar:

- A **URL scheme** (Everglow uses `everglowmobile`) is the prefix in callback links such as `everglowmobile://...`. After login, the **phone OS** must know which installed app owns that prefix. That claim is written into native metadata (iOS Info.plist URL types, Android intent filters) by the Auth0 config plugin at prebuild. Change the scheme and you need prebuild + a native rebuild; a Metro reload cannot update what the OS reads from the binary.
- **JS config values** such as `EXPO_PUBLIC_AUTH0_CLIENT_ID` or audience are ordinary strings your JavaScript reads when calling Auth0. They are baked into the JS bundle when Metro (or a Release bundle) runs. Change those and restart Metro, or rebuild Release so the embedded bundle updates. They do not by themselves rewrite Info.plist or the Android manifest.

Auth0 **domain** sits in both worlds in this app: JS uses it for API calls, and `app.config.ts` also passes it into the Auth0 config plugin so native callback registration stays correct. If you change domain, refresh JS _and_ run prebuild + a native rebuild.

## Where Expo sits

[Expo](https://expo.dev/) is the toolkit Everglow uses on top of React Native:

- **Expo Router**: file-based navigation (`app/`). Entry is `expo-router/entry` in `package.json`.
- **Config**: `app.json` + `app.config.ts` describe the app (name, scheme, plugins). `app.config.ts` injects Auth0 settings at **prebuild** time.
- **Config plugins**: small transformers that edit the generated native projects (for example `react-native-auth0` registers callback URLs).
- **CLI**: `expo start`, `expo prebuild`, `expo run:ios` / `run:android`.

We do **not** use Expo Go for day-to-day Everglow work. Native Auth0 and other native modules require a **dev client / custom native build** (`pnpm ios` / `pnpm android`).

Everglow uses **Continuous Native Generation (CNG)**:

- `ios/` and `android/` are **generated** and **gitignored** (see `mobile/.gitignore`).
- Source of truth for native config is Expo config + plugins + JS dependencies, not hand-edited Xcode/Gradle projects checked into git.
- `pnpm ios` / `pnpm android` run `expo prebuild` then build and install.

That is why CI also runs `expo prebuild` before building (see `.github/workflows/macos-smoke.yml`).

## Metro (the JavaScript bundler)

[Metro](https://metrobundler.dev/) is React Native’s bundler. Think “Vite for React Native,” with different constraints (Hermes, platform extensions like `.ios.tsx`, asset resolution).

### Debug / day-to-day local loop

```sh
pnpm start          # Metro only
# in another terminal, after a native install exists:
pnpm ios            # or pnpm android
```

Typical flow:

1. Native app is already installed on the simulator/emulator.
2. Metro serves the JS bundle over the network (or USB).
3. You save a file → Metro rebuilds → Fast Refresh updates the UI.

In this mode the native binary is a **host**; most product work stays in JS.

### Release / “no Metro” builds

A Release build **embeds** the JS bundle inside the app binary. There is no Metro process. That is what Mac smoke CI does:

```text
expo run:ios --configuration Release --no-bundler
```

Useful rule:

| Build kind                 | JS comes from                   | Native rebuild when…                                    |
| -------------------------- | ------------------------------- | ------------------------------------------------------- |
| Debug + Metro              | Metro on each launch / refresh  | Native deps or native config change                     |
| Release (store / CI smoke) | Bundle compiled into the binary | Any JS _or_ native change you care about in that binary |

## Prebuild: generating `ios/` and `android/`

`expo prebuild` reads Expo config and installed packages, then writes (or updates) **native projects** under `ios/` and `android/`.

“Native project” here means a real platform codebase, the same kind of tree you would open in Xcode or Android Studio: an Xcode project / CocoaPods `Podfile` / `Info.plist` on iOS, a Gradle project / manifests on Android, plus native glue from dependencies. It is not a diagram or a tiny side folder. It is the **source for the host binary**. Compiling that project is what produces the installed `.app` / APK that later runs your JS.

Prebuild and native build are different steps:

1. **Prebuild** materialises or refreshes `ios/` / `android/` from Expo config + plugins + `node_modules`.
2. **Native build** (`expo run:ios` / `run:android`, via Xcode / Gradle) compiles that project into the host and installs it.

In Everglow those native trees are **generated** and gitignored (CNG). Your day-to-day product code stays in the Expo / React Native tree; you do not normally hand-author features inside `ios/` or `android/`. Prebuild is how config (schemes, splash, Auth0 plugin output, native modules) becomes real native project files.

```text
app.json / app.config.ts + node_modules + config plugins
        │
        ▼
  expo prebuild          ← write/update native project source
        │
        ├─► ios/          Xcode project, Podfile, Info.plist, …
        └─► android/      Gradle project, manifests, …
        │
        ▼
  expo run:ios / android ← compile that project into the host binary
```

Everglow scripts (from `mobile/`):

```sh
pnpm ios       # prebuild --platform ios --no-install && expo run:ios
pnpm android   # prebuild --platform android --no-install && expo run:android
```

`--no-install` on the script’s prebuild step is broader than “skip `pnpm install`.” Expo’s flag means **skip installing npm packages and CocoaPods** during prebuild. You are expected to already have `node_modules` from an earlier `pnpm install`, and prebuild will not run `pod install` either. It still writes/updates `ios/` or `android/`. The following `expo run:*` still performs the platform’s native dependency install as needed when it compiles the host (CocoaPods on iOS, Gradle resolution on Android).

If `ios/` or `android/` is missing or stale (plugin change, new native module, splash/font change), prebuild refreshes it. Deleting those folders and prebuilding again is a normal recovery step when native state looks cursed.

## iOS build pieces

### Xcode

Apple’s IDE and toolchain. `expo run:ios` ultimately drives `xcodebuild` to compile the app for a simulator or device.

The important idea for CocoaPods and CI: Xcode may compile **many** pieces of native code, but the user still installs **one** Everglow app. Those pieces are glued together at link time into a single `.app` / process. They are not separate apps or background services sitting next to Everglow.

Terms you will hear:

- **Native code** (sometimes “native bits”): Swift, Objective-C, and related iOS source that Xcode compiles. This is not the JS Metro bundle. When a package “includes native iOS code,” that usually means files under something like `node_modules/<pkg>/ios`.
- **Target**: a single compile recipe inside Xcode (its own source files and build settings). What it outputs depends on the kind of target:
  - The **app target** builds the installable Everglow `.app` (the host you launch).
  - **Pod targets** (added by CocoaPods for Auth0, React Native, Expo modules, …) each build a **library** (or framework). A library is only an intermediate chunk of compiled code. It is not something the user installs on its own. Xcode **links** those libraries into the app target’s `.app`.
- **Project (`.xcodeproj`)**: a file that holds one or more targets. Prebuild creates the app’s project under `ios/`.
- **Workspace (`.xcworkspace`)**: a wrapper that lets Xcode build **several projects as one build**. After `pod install`, the workspace contains the app project and a `Pods` project. You build the workspace (not the app project alone) so the app target and all pod targets compile together and link into one host binary.

```text
Everglow.xcworkspace
├── Everglow.xcodeproj     app target  →  Everglow.app
└── Pods/Pods.xcodeproj    pod targets →  libraries
                                    ↘
                                      linked into Everglow.app
                                      (one installed host)
```

Why two projects instead of one project with many targets? A single `.xcodeproj` *could* hold the app target and every library target; linking would still produce one `.app`. CocoaPods uses a **separate** `Pods.xcodeproj` plus a workspace by convention: the app project stays “yours” (Expo prebuild), while CocoaPods can regenerate the Pods project on every `pod install` without rewriting the whole app project. The workspace is only the umbrella that builds both projects together. Separate projects are about ownership and churn, not about shipping a second app.

When does each side change?

- **`Pods.xcodeproj`**: whenever `pod install` runs against a changed `Podfile` / lockfile (new or updated native modules, RN/Expo upgrades that pull different pods). CocoaPods rewrites the Pods project and `Pods/` tree.
- **Everglow app project** (and the rest of `ios/` that prebuild owns: `Info.plist`, entitlements, splash, URL schemes, …): whenever **`expo prebuild`** runs with changed Expo config or plugins. Typical triggers: `app.json` / `app.config.ts` changes, Auth0 domain/scheme or other config-plugin output, new splash/icons/fonts registered natively, permission strings, bundle id / display name, Expo SDK upgrades, or adding a package whose **config plugin** edits the app project (not only adds a pod). In Everglow, `pnpm ios` runs prebuild before the build, so those app-project updates are applied then.

Adding a native module often touches **both**: prebuild updates the app project / `Podfile`, then `pod install` refreshes `Pods.xcodeproj`. JS-only package changes touch neither native project.

That can sound like it undoes “CocoaPods regenerates Pods without rewriting the whole app project.” It does not. “Touches both” means **two different jobs**, not two copies of the same heavy rewrite:

1. **Expo prebuild** may change the app side a little: `Podfile`, and sometimes `Info.plist` / URL schemes / permissions / similar wiring via a **config plugin**, plus whatever small link references the app needs. Surgical churn on “your” project.
2. **`pod install`** regenerates **`Pods.xcodeproj`** and `Pods/` with the actual library targets, sources, and build settings. That is the large dependency-shaped rewrite, and it stays in the Pods project.

So both sides can change when you add something like Auth0, but CocoaPods still is not stuffing every new library target into `Everglow.xcodeproj`. That isolation is what “without rewriting the whole app project” was about. Some native modules need almost no app-project edits beyond the `Podfile`; packages with config plugins (schemes, permissions) touch the app side more.

### CocoaPods and `Pods`

**CocoaPods** is the usual **dependency manager for native iOS libraries** (Objective-C / Swift), the way pnpm is the dependency manager for JavaScript packages. You declare native deps in a `Podfile`, run `pod install`, and CocoaPods fills an `ios/Pods/` directory and sets up an Xcode workspace so those libraries compile into the app.

Why it shows up in an Expo / React Native app: entries in `package.json` are not “JS bundle only.” One dependency can feed **either or both** layers:

| Kind of dependency                                             | What you get                        | Who consumes it                                   |
| -------------------------------------------------------------- | ----------------------------------- | ------------------------------------------------- |
| JS-only (many helpers, Zod, React Query, …)                    | Code Metro puts in the JS bundle    | Hermes at runtime                                 |
| Native module (Auth0, camera, parts of Expo / React Native, …) | JS **plus** iOS/Android native code | Metro for the JS API; Xcode / Gradle for the host |

“Comes with native code” means the npm package is usually **one folder under `node_modules` that contains both**:

- **JS/TS** you import from the app (the API / access point for your React Native code). Metro puts that in the JS bundle. At runtime your JS calls into the host through React Native’s native interface (bridge / JSI).
- **Native iOS and/or Android source** (Swift/ObjC, Kotlin/Java, a `.podspec`, Gradle files, …) that gets compiled **into the host** so the device can do things JS alone cannot (browser login redirects, keychain, camera hardware, and so on).

Everglow’s `react-native-auth0` package is a concrete example under `node_modules/react-native-auth0/`: `src/` / `lib/` (JS API), `ios/` + `A0Auth0.podspec` (native iOS), `android/` (native Android), plus an Expo `app.plugin.js`. You `import` the JS side in app code; the host only gains Auth0’s native behavior after that iOS/Android code is linked and compiled.

You still edit and install dependencies with **pnpm** (`package.json` → `node_modules`). That does not replace CocoaPods: pnpm will not by itself make Xcode compile a package’s iOS code. CocoaPods is not a second product list you maintain by hand either; prebuild / autolinking derives the native needs from those same packages into `ios/Podfile`.

If you know npm, the mapping is roughly:

| npm / JS                    | CocoaPods / iOS native |
| --------------------------- | ---------------------- |
| `package.json`              | `Podfile`              |
| `pnpm-lock.yaml` / lockfile | `Podfile.lock`         |
| `pnpm install`              | `pod install`          |
| `node_modules/`             | `Pods/`                |

After prebuild, the native install step is:

```text
ios/Podfile  →  pod install  →  ios/Pods/  +  Everglow.xcworkspace (name varies)
```

`pod install` is CocoaPods’ install command. It fills `ios/Pods/` (the on-disk native dependency tree, analogous to `node_modules`) and produces the Xcode **workspace** described above (app project + `Pods` project). Building that workspace compiles the app target and the pod targets and links them into one host `.app`.

On a clean machine (or GitHub `macos-latest`), `pod install` can take several minutes. That cost is a big part of “why is the Mac smoke job slow?” It is usually slower than `pnpm install` because the work is heavier: CocoaPods resolves and fetches **native** libraries (often large source trees, not small JS packages), writes them into `Pods/`, and rewires the Xcode workspace/project so those targets will compile with the app. A warm CocoaPods cache or an already-populated `Pods/` directory helps; a fresh GitHub runner has neither, so you pay the full download and integration cost every cold run.

### DerivedData

Xcode’s build cache and intermediate products live under **DerivedData** (default `~/Library/Developer/Xcode/DerivedData`, or a custom `-derivedDataPath`).

It holds compiled object files, indexes, module caches, and build products. A warm DerivedData tree can make the next compile much faster; a stale or mismatched one (different Xcode version, half-restored CI cache) can cause obscure build failures.

For Everglow locally you rarely touch it by name; Xcode manages it. In CI conversations, “cache DerivedData” means trying to reuse those intermediates across ephemeral runners.

### Simulator vs device

- **Simulator**: runs on the Mac; what local `pnpm ios` and Mac smoke CI use.
- **Physical device**: needs signing (Apple developer certs / provisioning). Different from simulator binaries.

## Android build pieces

### Gradle

Android’s build system (the Maven/Gradle world). `expo run:android` drives Gradle to compile the app and install it on an emulator or device.

### Emulator vs device

- **Emulator**: Android Virtual Device on your machine.
- **Device**: USB debugging / wireless debugging with an installed debug build.

### Caches you will hear about

| Location / concept                 | Role                                         |
| ---------------------------------- | -------------------------------------------- |
| Gradle caches (`~/.gradle/caches`) | Downloaded artifacts and build cache         |
| Android SDK / build-tools          | Platform tooling on the machine              |
| `android/` project                 | Generated app module, manifests, native glue |

Android has no CocoaPods. Native third-party code often arrives via Gradle dependencies or React Native / Expo autolinking into the generated project.

Everglow’s Mac smoke workflow today is **iOS-only**; Android E2E is documented for local/Maestro use in [e2e.md](./e2e.md).

## End-to-end: local Debug install

From `mobile/` after `pnpm install` and a configured `.env`:

```text
pnpm ios
        │
        ├─ expo prebuild --platform ios
        │     writes/updates ios/
        │
        └─ expo run:ios
              ├─ CocoaPods install (as needed)
              ├─ xcodebuild (Debug) → Everglow.app
              ├─ install on Simulator
              └─ launch; JS loaded from Metro (if Metro is running)
```

Android is the same shape with Gradle instead of CocoaPods/Xcode:

```text
pnpm android
        │
        ├─ expo prebuild --platform android
        │
        └─ expo run:android
              ├─ Gradle resolve + compile
              ├─ install on emulator/device
              └─ launch; JS from Metro in Debug
```

## End-to-end: CI Release smoke (iOS)

`.github/workflows/macos-smoke.yml` (`workflow_dispatch`) roughly:

```text
checkout + pnpm install          # JS deps (pnpm store can be cached)
install Maestro CLI
boot iPhone simulator
expo prebuild --platform ios     # generate ios/ on a clean runner
expo run:ios --configuration Release --no-bundler
                                 # full native compile + embed JS; no Metro
maestro test …                   # drive the installed app UI
```

The runner VM is **ephemeral** (fresh each job). Cross-run speedups only happen if CI **restores caches** (pnpm today; CocoaPods / DerivedData / Maestro are the kinds of layers discussed in EV-210). A cache miss still does a correct full build; it just takes longer.

## What requires which kind of refresh

| You changed…                                     | Usually enough                                                          |
| ------------------------------------------------ | ----------------------------------------------------------------------- |
| Screen, hook, style, most TS/TSX                 | Fast Refresh / Metro reload                                             |
| `EXPO_PUBLIC_*` JS values (e.g. Auth0 client id) | Restart Metro (and rebuild if the value is baked into a Release binary) |
| Splash, native fonts, app icon                   | Native rebuild (`pnpm ios` / `android`)                                 |
| Auth0 URL scheme (e.g. `everglowmobile`)         | Prebuild + native rebuild (OS routing in the binary)                    |
| Auth0 domain (JS + config plugin)                | Restart Metro / Release bundle, **and** prebuild + native rebuild       |
| Other Expo config plugins / native modules       | Prebuild + native rebuild                                               |
| Added a package with native code                 | `pnpm install` → prebuild + native rebuild                              |
| Only Maestro YAML                                | Re-run Maestro; no app rebuild                                          |

When in doubt: if the change must live in Info.plist, AndroidManifest, linked native code, or the embedded Release bundle, you need a native (and possibly Release) rebuild.

## Glossary

| Term                     | One-line meaning                                                                                             |
| ------------------------ | ------------------------------------------------------------------------------------------------------------ |
| **React Native**         | UI framework: React → native views, not the DOM.                                                             |
| **Expo**                 | Tooling and libraries on top of React Native (Router, prebuild, modules).                                    |
| **Expo Go**              | Expo’s store client for JS-only experimentation; **not** how we run Everglow with Auth0.                     |
| **Dev client**           | Your own native binary that still loads JS from Metro in development.                                        |
| **Metro**                | JS bundler / dev server for React Native.                                                                    |
| **Hermes**               | JS engine embedded in the app.                                                                               |
| **Prebuild**             | Generate `ios/` / `android/` from Expo config + plugins.                                                     |
| **CNG**                  | Continuous Native Generation: regenerate native projects; don’t treat them as long-lived hand-edited source. |
| **Autolinking**          | RN/Expo wiring native modules from `node_modules` into the native project.                                   |
| **CocoaPods**            | Dependency manager for native iOS libraries (pnpm’s counterpart for the host’s ObjC/Swift deps).             |
| **Pods**                 | On-disk tree CocoaPods installs into (`ios/Pods/`), analogous to `node_modules`.                             |
| **Xcode target**         | One compile recipe. The app target makes the `.app`; pod targets make libraries linked into that `.app`. |
| **Xcode workspace**      | Builds the app project and Pods project together into one installed host. |
| **DerivedData**          | Xcode’s compile cache and intermediate build products.                                                       |
| **Gradle**               | Android build system.                                                                                        |
| **Debug vs Release**     | Debug often uses Metro; Release embeds JS and optimizes native code.                                         |
| **Simulator / Emulator** | Virtual iOS / Android device on your computer.                                                               |
| **Maestro**              | Separate E2E UI test CLI; drives the already-installed app ([e2e.md](./e2e.md)).                             |

## Related docs

| Topic                              | Doc                                          |
| ---------------------------------- | -------------------------------------------- |
| Local commands and docs index      | [mobile/README.md](../README.md)             |
| Maestro E2E and Mac smoke overview | [e2e.md](./e2e.md)                           |
| Writing app code                   | [code-conventions.md](./code-conventions.md) |
| Shared product / architecture      | [Repo `docs/`](../../docs/)                  |
