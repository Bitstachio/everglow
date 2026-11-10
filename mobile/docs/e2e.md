# E2E tests (Maestro)

This document covers end-to-end testing for the Everglow mobile app: what we use, where flows live, and how to set up a machine to run them. It is not a Maestro tutorial; use the [official Maestro docs](https://docs.maestro.dev/) for flow syntax.

**Convention hierarchy:** E2E work follows [codebase conventions](./code-conventions.md). Flows live under `mobile/.maestro/` next to the Expo app; component tests stay beside their components and use Jest / RNTL (see [Testing](./testing.md)).

**Tool:** [Maestro](https://maestro.dev/) — a separate CLI (not an npm dependency). Flows are YAML under `.maestro/`; `config.yaml` controls discovery.

**Sample flows:** `.maestro/flows/login-smoke.yaml` (Auth0 login → Events), `.maestro/flows/profile.yaml` (Account Settings smoke; needs an existing session unless login ran first).

## Layout

| Path                   | Role                                                   |
| ---------------------- | ------------------------------------------------------ |
| `.maestro/config.yaml` | Flow discovery (`flows/**`)                            |
| `.maestro/flows/`      | Runnable YAML tests                                    |
| `.maestro/helpers/`    | Optional reusable subflows (`runFlow`); not standalone |
| `.maestro/results/`    | Generated reports and debug output (gitignored)        |

Keep the Maestro workspace under `mobile/` because it targets this Expo app (bundle IDs, `testID`s, native builds). Needing a running API does not move the suite to the monorepo root.

## Install the CLI

Install Java 17 or newer, then follow the [official CLI installation guide](https://docs.maestro.dev/maestro-cli/how-to-install-maestro-cli). On macOS:

```sh
curl -fsSL "https://get.maestro.mobile.dev" | MAESTRO_VERSION=2.10.0 bash
export PATH="$PATH:$HOME/.maestro/bin"
maestro --version
```

This setup was syntax-checked with Maestro 2.10.0. The installer adds Maestro to your shell startup files; open a new terminal or use the `PATH` export above in an existing terminal. If Maestro reports an invalid `JAVA_HOME`, select an installed JDK without trailing whitespace. For Java 21 on macOS:

```sh
export JAVA_HOME="$(/usr/libexec/java_home -v 21)"
```

## Prepare the app

Run commands below from `mobile/`.

1. Install dependencies with `pnpm install --frozen-lockfile`.
2. Configure `mobile/.env` using `.env.example`, including a reachable API and working Auth0 settings. Android emulators use `http://10.0.2.2:3000` for a local API; iOS simulators use `http://localhost:3000`.
3. Boot an iOS simulator or Android emulator, then build and install the app with `pnpm ios` or `pnpm android`. This app uses native Auth0, so use a native build. Expo Go is not supported by these flows.
4. Keep Metro running for debug builds. Open the app, sign in with a test account, complete onboarding, and dismiss any development overlays before running the test. The API must remain available so the app can restore the session after relaunch.

## Run

```sh
# iOS simulator
pnpm test:e2e:ios

# Android emulator
pnpm test:e2e:android

# Login smoke only (clears app state, runs helpers/login.yaml). Export Auth0
# creds in the shell — nested pnpm `--` breaks Maestro's argv:
E2E_EMAIL=user1@everglow.social E2E_PASSWORD='your-test-password' \
  pnpm test:e2e:login:ios
```

Point `EXPO_PUBLIC_API_URL` at staging when exercising seeded Neon users. Staging API Auth0 (`AUTH0_DOMAIN` / `AUTH0_AUDIENCE`) must match the mobile tenant or login succeeds in Auth0 and then fails on API calls. On iOS Simulator, disable Password AutoFill if Maestro cannot type into the Auth0 password field.

The platform scripts supply the different identifiers from `app.json`:

| Platform | App ID                          |
| -------- | ------------------------------- |
| iOS      | `com.anonymous.everglow-mobile` |
| Android  | `com.anonymous.everglowmobile`  |

For another build identifier or a subset of flows:

```sh
pnpm test:e2e -e APP_ID=com.example.app --include-tags profile
```

With multiple devices connected, select one explicitly:

```sh
maestro --device <device-id> test -e APP_ID=com.anonymous.everglow-mobile .maestro
```

The package scripts write JUnit output to `.maestro/results/report.xml` and diagnostic artifacts to `.maestro/results/`. Generated results are ignored by Git and Prettier. Each run replaces the JUnit report; copy it elsewhere before another run if needed.

Validate the sample's syntax without a device:

```sh
maestro check-syntax .maestro/flows/profile.yaml
```

## Sample: Events → Account Settings

`flows/profile.yaml` relaunches the app, waits for authenticated navigation, taps the Events avatar, checks the Account Settings stub, and uses Back to return to Events. It uses native `testID` selectors for interactions and Maestro's built-in waits rather than fixed sleeps. It does not save profile changes.

The flow deliberately preserves app data with `clearState: false`: it requires an existing authenticated, onboarded session. If it times out waiting for `events-profile-button`, check the API connection, sign in again, complete onboarding, and ensure Metro is serving the app. This smoke test does not cover login or onboarding.

Add further test YAML files under `flows/`. Keep reusable subflows in a sibling `helpers/` directory and call them with `runFlow` so they are not discovered as standalone tests.

## Login helper

`helpers/login.yaml` taps `login-submit`, drives Auth0 Universal Login with `E2E_EMAIL` / `E2E_PASSWORD`, and waits for `events-profile-button`. It handles both pages Auth0 can show: the login form on a fresh simulator, and the "Authorize App" consent page (it taps **Accept**) when an earlier login on the same simulator left an Auth0 web session behind. That session lives in the system web view's cookies, which `clearState` and `clearKeychain` do not clear, so a CI retry after a later flow failed lands on the consent page instead of the form. The staging Auth0 API has **Allow Skipping User Consent** enabled, so the **Accept** tap is meant only as a fallback for a tenant where it is off. Run `42913061684` still showed the consent page on its retry after that setting was turned on, so do not remove the fallback. A wrong password still fails: the form path waits for Events, and the CI script reads "Wrong email or password" from the screen and classifies it `clear`. It is not discovered as its own test; `flows/login-smoke.yaml` calls it after `clearState: true`. Seeded users (`api` `pnpm run seed:staging-e2e`) skip onboarding.

## CI

GitHub Actions workflow [`.github/workflows/macos-smoke.yml`](../../.github/workflows/macos-smoke.yml) builds a Release iOS simulator binary (no Metro), then runs `pnpm test:e2e:login:ios:ci`. That script runs the login smoke against the app already on the simulator. It does not prebuild or rebuild.

### When it runs

| Trigger             | When                                                                                    |
| ------------------- | --------------------------------------------------------------------------------------- |
| `schedule`          | Nightly at 08:00 UTC, on `main`                                                         |
| `workflow_dispatch` | By hand on any branch: `gh workflow run macos-smoke.yml --ref <branch>`                 |
| `pull_request`      | When the `mac-smoke` label is added, and on each push or reopen while the PR carries it |

Without the label, a pull request's run shows the job as skipped and costs no Mac minutes. The workflow uses `pull_request`, never `pull_request_target`, because the repository is public. Pull requests from forks get no secrets, so their run fails at the secrets check with a message saying so; push the branch to this repository and dispatch it instead.

Every run signs in as the same seeded staging user, so the job uses one concurrency group for the whole repository (`macos-smoke-e2e-user`). A running smoke is never cancelled; later runs wait. GitHub keeps one pending run per group, so when a third run queues, the older pending one is cancelled. A nightly can be displaced that way only when two runs queue behind a running one; the next night runs again.

### Fail fast

- **Staging preflight.** Right after the secrets check, `scripts/check-maestro-api.sh` calls the API's liveness route `GET /api/v2` (`api/src/app.controller.ts`, the same path as the load balancer health check) up to four times with a 10 s timeout. If staging does not answer, the job fails in under a minute instead of after the build.
- **Pinned simulator.** `SIM_DEVICE` and `SIM_RUNTIME` in the workflow pin the iPhone model and iOS runtime (`iPhone 17` on `iOS 26.5`, from the `macos-26-arm64` image). `scripts/pick-maestro-simulator.js` prints the device it chose. When the image no longer has that runtime, it uses the newest iOS runtime with the same model and adds a warning annotation to the run; when no runtime has the model, it fails and lists every available iPhone.
- **Boot overlaps the build.** The simulator starts booting before `pnpm install` and finishes while the app compiles. The job waits on `simctl bootstatus` only before installing the app. An already booted simulator is fine; any other boot error fails the step.
- **Sign-in errors in the app.** `helpers/login.yaml` asserts that the app's "Couldn’t sign in" alert is not showing once the sign-in tap has had time to open Auth0, so an app error fails in seconds instead of after the 60 s wait for the Auth0 page. When any later step fails, the CI script reads the screen hierarchy Maestro saved for the failing command (`commands.json` points at `screen-hierarchy/step-*.json`), prints it as `Screen at failure (attempt N): …`, and classifies it with the log. "Couldn’t sign in", `OSStatus`, `errSec…`, "… the Keychain" and Auth0's "Wrong email or password" on screen are clear failures, so they are not retried.

### Mac smoke caches

The hosted runner is ephemeral. Cross-run speedups come from Actions caches. Bump `CACHE_EPOCH` in the workflow to invalidate every layer at once.

| Layer               | Path                         | Key inputs                     | Notes                                                                                                                                                                                                                                                                                                                            |
| ------------------- | ---------------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| pnpm store          | via `actions/setup-node`     | `mobile/pnpm-lock.yaml`        | Already present before EV-210                                                                                                                                                                                                                                                                                                    |
| CocoaPods downloads | `~/Library/Caches/CocoaPods` | epoch + lockfile + Expo config | Speeds `pod install` fetches during prebuild; does not cache `ios/Pods`                                                                                                                                                                                                                                                          |
| Maestro CLI         | `~/.maestro`                 | `MAESTRO_VERSION`              | Skips the curl install on a hit                                                                                                                                                                                                                                                                                                  |
| Xcode DerivedData   | not cached                   |                                | Measured and dropped: prebuild regenerates `ios/` and `pnpm install` writes `node_modules` fresh each run, so Xcode recompiled a restored tree anyway (warm run `42901234610`). Reusing the built `.app` is [EV-230](https://linear.app/mehrshadfb/issue/EV-230/reuse-the-built-mac-smoke-app-when-its-native-and-js-inputs-are) |

A run restores caches saved on its own branch or on `main` (and, for a pull request, on its base branch), never from a sibling branch ([GitHub docs](https://docs.github.com/en/actions/reference/workflows-and-actions/dependency-caching)). Caches saved on a feature branch only speed up later runs of that branch; caches saved by a run on `main` speed up every branch.

The workflow restores each cache with `actions/cache/restore` and saves it with `actions/cache/save`, so a cold run keeps its caches even when the smoke fails. The Maestro CLI is saved right after install, before any flow can write session files under `~/.maestro`. CocoaPods downloads are saved after a successful prebuild, in an `always()` step at the end of the job. An exact-key hit is not saved again. Saving needs no extra `permissions`: the cache service uses the job's cache token, whose access comes from the trigger's `cache-mode` (write for `workflow_dispatch`, `schedule` and `push`), not from `GITHUB_TOKEN` scopes.

The simulator build keeps Xcode's ad hoc signing. Do not pass `CODE_SIGNING_ALLOWED=NO`: an unsigned app has no Keychain entitlement, and Auth0 sign-in then fails in the app with `OSStatus -34018`. The build step fails if the `.app` is not signed.

The build uses `xcodebuild` with a fixed `-derivedDataPath` instead of `expo run:ios`, and builds only the runner's architecture (`ARCHS=$(uname -m)`, `ONLY_ACTIVE_ARCH=YES`). That cut the build step below the baseline, but runner speed decides most of the build time (see the table). Not in this workflow: reusing a built `.app` when native and JS inputs are unchanged ([EV-230](https://linear.app/mehrshadfb/issue/EV-230/reuse-the-built-mac-smoke-app-when-its-native-and-js-inputs-are)).

Measured on `macos-latest` (`macos-26-arm64`, Xcode 26.6). Job time runs from job start to end and excludes the queue. Hosted Mac runners vary a lot from run to run (the simulator boot alone took 1 to 3.5 min in these runs).

| Run                                                                    | Job                      | Build step  | Notes                                                                              |
| ---------------------------------------------------------------------- | ------------------------ | ----------- | ---------------------------------------------------------------------------------- |
| `41856393315`, baseline: `expo run:ios`, both simulator architectures  | 41 min                   | 28.6 min    | Login passed                                                                       |
| `42893320031`, cold: single-arch `xcodebuild`, all caches missed       | 16 min                   | 6.5 min     | Smoke failed at Auth0 sign-in, a rejected password, after the build                |
| `42901234610`, warm: Maestro, CocoaPods and DerivedData caches all hit | not measured (cancelled) | over 10 min | Cancelled during the build; DerivedData restore took 36 s and the build recompiled |
| `42904800710`, cold on another branch (stack top, more flows)          | 37 min                   | 14.5 min    | Login passed; most of the job is the extra flows                                   |
| `42911090551`, Maestro and CocoaPods hit, DerivedData missed           | 46 min                   | 22.2 min    | Login passed on attempt 1                                                          |
| `42918743372`, cold: all caches missed, no DerivedData step            | 39 min                   | 23.5 min    | Login passed on attempt 1                                                          |

Without the DerivedData cache, the single-arch build step took 6.5 to 23.5 min across four runs, and three of them took 14.5 to 23.5 min. The baseline took 28.6 min. Runner speed matters more than the build changes: `42893320031`'s 6.5 min is the fastest run so far, not the usual time, so plan for about 15 to 25 min.

Required repository secrets:

| Secret                        | Purpose                                                                            |
| ----------------------------- | ---------------------------------------------------------------------------------- |
| `E2E_EMAIL` / `E2E_PASSWORD`  | Seeded Auth0 user for Universal Login                                              |
| `EXPO_PUBLIC_API_URL`         | Public HTTPS API (not `localhost`); Auth0 on that API must match the mobile tenant |
| `EXPO_PUBLIC_AUTH0_DOMAIN`    | Native app Auth0 domain                                                            |
| `EXPO_PUBLIC_AUTH0_CLIENT_ID` | Native app client id                                                               |
| `EXPO_PUBLIC_AUTH0_AUDIENCE`  | API audience (same as API `AUTH0_AUDIENCE`)                                        |

```sh
gh workflow run macos-smoke.yml --ref <branch-with-workflow>
gh pr edit <number> --add-label mac-smoke   # or run it on a pull request
```

Artifacts upload `.maestro/results/` (including failures). The repository is public, so its workflow artifacts are too. Maestro writes every `-e` value into `commands.json`, including `E2E_PASSWORD`, so the workflow runs `scripts/scrub-maestro-results.js` first. It replaces the password with `***` in text files, deletes any binary file that holds it, and fails the step if the password is still present. The upload is skipped when the scrub step fails. Pass any new secret you add as a Maestro `-e` value to that step too.

### Mac smoke retries

`pnpm test:e2e:login:ios` on a laptop runs once. The CI script (`scripts/run-maestro-login-ios.js`) classifies a failed attempt from the Maestro log, `report.xml` and the text on screen when the failing command ran, then retries **once** or stops:

| Class     | What it looks like                                                                                                                                                                                                                          | What the job does          |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| flake     | XCTest driver or simulator unreachable, connection refused to `127.0.0.1`, `kAXErrorInvalidUIElement`, failed to get the view hierarchy                                                                                                     | Retry the Maestro run once |
| ambiguous | Element not found, assertion timeout, Auth0 web view still loading, empty output, any other failure that is not clearly deterministic                                                                                                       | Retry the Maestro run once |
| clear     | Wrong email or password, the app's "Couldn’t sign in" alert, a Keychain `OSStatus` error, required Auth0 fields, account being deleted, Auth0 not configured, onboarding failed, flow parse error, Maestro invocation error, `pnpm` missing | Fail immediately           |

A clear pattern wins when the same log also contains a driver error, so a rejected password is not retried. A second failure fails the job even if it still looks transient. The class is printed on its own line, for example `Maestro login smoke attempt 1 failed (flake). Retrying once without rebuilding.` or `Maestro login smoke passed on attempt 2 after a flake failure.`

Maestro replaces `report.xml` on each run. Before a retry, the first attempt is copied to `.maestro/results/attempt-1/`. Logs are `attempt-1.log` and, when a retry ran, `attempt-2.log`. The root `report.xml` is the last attempt. Routine startup text such as `XCTest driver started` does not count as a flake.

### Where retries are recorded

`scripts/maestro-attempt-summary.js` keeps each attempt's result, failure class and duration in three places:

| Where                                | What                                                                                                         | Kept               |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------ | ------------------ |
| Job summary (the run's Summary page) | Simulator and runtime, one row per attempt, the results artifact name and download link                      | As long as the run |
| `Mac smoke retry` warning annotation | Only when a retry rescued the run: `Login smoke passed on attempt 2 after a flake failure.` (or `ambiguous`) | As long as the run |
| `attempts.json` in the artifact      | `outcome`, `rescuedFrom`, device, runtime and the attempts array                                             | Artifact, 7 days   |

A first-try pass records no warning. A clear failure is never retried, so it is never counted as a rescued flake. To list rescued runs, query the annotations; the job id is also its check run id:

```sh
gh run list --workflow macos-smoke.yml --limit 50 --json databaseId -q '.[].databaseId' |
  while read -r run; do
    gh api "repos/Bitstachio/everglow/actions/runs/$run/jobs" -q '.jobs[].id' |
      while read -r job; do
        gh api "repos/Bitstachio/everglow/check-runs/$job/annotations" \
          -q ".[] | select(.title == \"Mac smoke retry\") | \"$run \(.message)\""
      done
  done
```
