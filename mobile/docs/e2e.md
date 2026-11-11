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
2. Moves the roll to the half hour under way now in the When slip, swiping the times strip until that time shows (the strip lists only the times on screen). A new roll starts tonight by default, and photos can only be added once it has opened; a time already past opens it at once.
3. Loads the roll, closes the envelope, and taps the shutter (`roll-add-photos`, or the first-visit button `roll-opened-action`).
4. Picks the fixture photo in the system photo picker by its date label (`Photo, January 01, 2001, …`), taps Done (Add on older iOS), and waits up to two minutes for a frame on the roll (`roll-frame`).

`launchApp` grants Photos access, so no permission alert shows. The photo is `.maestro/fixtures/smoke-photo.jpg`, a 15 KB generated image. Its EXIF date, 1 January 2001, is older than every sample photo the simulator ships with, so its label in the picker is unique. CI adds it with `xcrun simctl addmedia` before Maestro runs.

**Cleanup.** `helpers/delete-smoke-rolls.yaml` deletes every roll on Home named `Smoke-…`: it opens the roll, cuts it if it is still open (only a closed roll can be deleted), then deletes it from the roll menu. The flow runs it in `onFlowStart`, for rolls an earlier run left behind, and in `onFlowComplete`, so its own roll goes whether the flow passed or failed. If cleanup fails, the flow fails. The E2E account runs on the free plan, which allows a limited number of rolls at a time, so leftover rolls would otherwise block the next run. Don't name your own rolls `Smoke-…` on the E2E account.

Mac smoke runs one at a time (see [When it runs](./mac-smoke.md#when-it-runs)), so two CI runs never delete each other's roll. A local run at the same time as CI still can.

Add further test YAML files under `flows/`. Keep reusable subflows in a sibling `helpers/` directory and call them with `runFlow` so they are not discovered as standalone tests.

## Login helper

`helpers/login.yaml` taps `login-submit`, drives Auth0 Universal Login with `E2E_EMAIL` / `E2E_PASSWORD`, and waits for `events-profile-button`. It handles both pages Auth0 can show: the login form on a fresh simulator, and the "Authorize App" consent page (it taps **Accept**) when an earlier login on the same simulator left an Auth0 web session behind. That session lives in the system web view's cookies, which `clearState` and `clearKeychain` do not clear, so a CI retry after a later flow failed lands on the consent page instead of the form. The staging Auth0 API has **Allow Skipping User Consent** enabled, so the **Accept** tap is meant only as a fallback for a tenant where it is off. Run `42913061684` still showed the consent page on its retry after that setting was turned on, so do not remove the fallback. A wrong password still fails: the form path waits for Events, and the CI script reads "Wrong email or password" from the screen and classifies it `clear`. It is not discovered as its own test; `flows/login-smoke.yaml` calls it after `clearState: true`. Seeded users (`api` `pnpm run seed:staging-e2e`) skip onboarding.

## CI: Mac smoke

The Mac smoke GitHub Actions job builds a Release iOS app on a hosted Mac and runs this smoke suite against staging, nightly and on pull requests labelled `mac-smoke`. Its triggers, secrets, retries, artifacts and caches are in [Mac smoke](./mac-smoke.md).
