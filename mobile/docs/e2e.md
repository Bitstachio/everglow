# E2E tests (Maestro)

This document covers end-to-end testing for the Everglow mobile app: what we use, where flows live, and how to set up a machine to run them. It is not a Maestro tutorial; use the [official Maestro docs](https://docs.maestro.dev/) for flow syntax.

**Convention hierarchy:** E2E work follows [codebase conventions](./code-conventions.md). Flows live under `mobile/.maestro/` next to the Expo app; component tests stay beside their components and use Jest / RNTL (see [Testing](./testing.md)).

**Tool:** [Maestro](https://maestro.dev/) — a separate CLI (not an npm dependency). Flows are YAML under `.maestro/`; `config.yaml` controls discovery.

**Flows:**

| Flow                     | Tags               | What it checks                                                                                       |
| ------------------------ | ------------------ | ---------------------------------------------------------------------------------------------------- |
| `flows/login-smoke.yaml` | `smoke`, `login`   | Fresh install, Auth0 login, lands on Home                                                            |
| `flows/profile.yaml`     | `smoke`, `profile` | Home avatar opens your lab card (account settings), Back returns Home                                |
| `flows/roll-upload.yaml` | `smoke`, `roll`    | Loads a roll, adds a photo from the photo library, sees the frame on the roll, then deletes the roll |

`config.yaml` runs them in that order (`executionOrder`), and stops at the first failure. Profile and roll upload reuse the session the login flow leaves on the device.

## Layout

| Path                   | Role                                                   |
| ---------------------- | ------------------------------------------------------ |
| `.maestro/config.yaml` | Flow discovery (`flows/**`)                            |
| `.maestro/flows/`      | Runnable YAML tests                                    |
| `.maestro/helpers/`    | Optional reusable subflows (`runFlow`); not standalone |
| `.maestro/fixtures/`   | Files the flows need on the device, such as the photo  |
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

# Smoke suite: login (clears app state, runs helpers/login.yaml), then profile,
# then roll upload. Export Auth0 creds in the shell — nested pnpm `--` breaks
# Maestro's argv:
E2E_EMAIL=user1@everglow.social E2E_PASSWORD='your-test-password' \
  pnpm test:e2e:login:ios
```

The roll upload flow needs a photo in the simulator's library. Add the fixture once per simulator:

```sh
xcrun simctl addmedia booted .maestro/fixtures/smoke-photo.jpg
```

Point `EXPO_PUBLIC_API_URL` at staging when exercising seeded Neon users. Staging API Auth0 (`AUTH0_DOMAIN` / `AUTH0_AUDIENCE`) must match the mobile tenant or login succeeds in Auth0 and then fails on API calls. On iOS Simulator, disable Password AutoFill if Maestro cannot type into the Auth0 password field.

The platform scripts supply the different identifiers from `app.json`:

| Platform | App ID                          |
| -------- | ------------------------------- |
| iOS      | `com.anonymous.everglow-mobile` |
| Android  | `com.anonymous.everglowmobile`  |

For another build identifier, or to run one flow, pass the flow file. Its session must already be signed in:

```sh
maestro test -e APP_ID=com.example.app .maestro/flows/profile.yaml
```

A tag filter on the whole workspace must keep the login flow. Maestro refuses an `executionOrder` whose first flow was filtered out ("Could not find flows needed for execution in order").

With multiple devices connected, select one explicitly:

```sh
maestro --device <device-id> test -e APP_ID=com.anonymous.everglow-mobile .maestro
```

The package scripts write JUnit output to `.maestro/results/report.xml` and diagnostic artifacts to `.maestro/results/`. Generated results are ignored by Git and Prettier. Each run replaces the JUnit report; copy it elsewhere before another run if needed.

Validate the sample's syntax without a device:

```sh
maestro check-syntax .maestro/flows/roll-upload.yaml
```

## Profile: Home → lab card

`flows/profile.yaml` relaunches the app, waits for Home, taps the avatar, checks the lab card screen (`account-settings`, with its Username row), and uses its Back button (`account-settings-back`) to return Home. It does not save profile changes.

The flow keeps app data (`clearState: false`): it needs a signed-in, onboarded session. If it times out waiting for `events-profile-button`, check the API connection, sign in again, complete onboarding, and ensure Metro is serving the app.

## Roll upload: load a roll, add a photo, delete it

`flows/roll-upload.yaml` runs against the shared staging API, as the E2E user:

1. Taps New event (`home-new-roll`) and names the roll `Smoke-<timestamp>`.
2. Moves the roll to 00:00 today in the When slip. A new roll starts tonight by default, and photos can only be added once it has opened; a time already past opens it at once.
3. Loads the roll, closes the envelope, and taps the shutter (`roll-add-photos`, or the first-visit button `roll-opened-action`).
4. Picks the fixture photo in the system photo picker by its date label (`Photo, January 01, 2001, …`), taps Done (Add on older iOS), and waits up to two minutes for a frame on the roll (`roll-frame`).

`launchApp` grants Photos access, so no permission alert shows. The photo is `.maestro/fixtures/smoke-photo.jpg`, a 15 KB generated image. Its EXIF date, 1 January 2001, is older than every sample photo the simulator ships with, so its label in the picker is unique. CI adds it with `xcrun simctl addmedia` before Maestro runs.

**Cleanup.** `helpers/delete-smoke-rolls.yaml` deletes every roll on Home named `Smoke-…`: it opens the roll, cuts it if it is still open (only a closed roll can be deleted), then deletes it from the roll menu. The flow runs it in `onFlowStart`, for rolls an earlier run left behind, and in `onFlowComplete`, so its own roll goes whether the flow passed or failed. If cleanup fails, the flow fails. The E2E account runs on the free plan, which allows a limited number of rolls at a time, so leftover rolls would otherwise block the next run. Don't name your own rolls `Smoke-…` on the E2E account.

Two runs at the same time with the same E2E account can delete each other's roll.

Add further test YAML files under `flows/`. Keep reusable subflows in a sibling `helpers/` directory and call them with `runFlow` so they are not discovered as standalone tests.

## Login helper

`helpers/login.yaml` taps `login-submit`, drives Auth0 Universal Login with `E2E_EMAIL` / `E2E_PASSWORD`, and waits for `events-profile-button`. It is not discovered as its own test; `flows/login-smoke.yaml` calls it after `clearState: true`. Seeded users (`api` `pnpm run seed:staging-e2e`) skip onboarding.

## CI

GitHub Actions workflow [`.github/workflows/macos-smoke.yml`](../../.github/workflows/macos-smoke.yml) (`workflow_dispatch`) builds a Release iOS simulator binary (no Metro), adds `.maestro/fixtures/smoke-photo.jpg` to the simulator's photo library, then runs `pnpm test:e2e:login:ios:ci`. That script runs the smoke suite (login, profile, roll upload; `--include-tags smoke`) against the app already on the simulator. It does not prebuild or rebuild. A retry runs the whole suite again, from login.

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
```

Artifacts upload `.maestro/results/` (including failures). The repository is public, so its workflow artifacts are too. Maestro writes every `-e` value into `commands.json`, including `E2E_PASSWORD`, so the workflow runs `scripts/scrub-maestro-results.js` first. It replaces the password with `***` in text files, deletes any binary file that holds it, and fails the step if the password is still present. The upload is skipped when the scrub step fails. Pass any new secret you add as a Maestro `-e` value to that step too.

### Mac smoke retries

`pnpm test:e2e:login:ios` on a laptop runs once. The CI script (`scripts/run-maestro-login-ios.js`) classifies a failed attempt from the Maestro log and `report.xml`, then retries **once** or stops:

| Class     | What it looks like                                                                                                                                                         | What the job does          |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| flake     | XCTest driver unreachable, connection refused to `127.0.0.1`, `kAXErrorInvalidUIElement`, failed to get the view hierarchy                                                 | Retry the Maestro run once |
| ambiguous | Element not found, assertion timeout, Auth0 web view still loading, empty output, any other failure that is not clearly deterministic                                      | Retry the Maestro run once |
| clear     | Wrong email or password, required Auth0 fields, account being deleted, Auth0 not configured, onboarding failed, flow parse error, Maestro invocation error, `pnpm` missing | Fail immediately           |

A clear pattern wins when the same log also contains a driver error, so a rejected password is not retried. A second failure fails the job even if it still looks transient. The class is printed on its own line, for example `Maestro login smoke attempt 1 failed (flake). Retrying once without rebuilding.` or `Maestro login smoke passed on attempt 2 after a flake failure.` Those lines are not counted yet ([EV-213](https://linear.app/mehrshadfb/issue/EV-213/record-mac-smoke-maestro-retries-so-flakes-can-be-investigated)).

Maestro replaces `report.xml` on each run. Before a retry, the first attempt is copied to `.maestro/results/attempt-1/`. Logs are `attempt-1.log` and, when a retry ran, `attempt-2.log`. The root `report.xml` is the last attempt. Routine startup text such as `XCTest driver started` does not count as a flake.
