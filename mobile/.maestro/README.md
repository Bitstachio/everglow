# Maestro E2E tests

Keep mobile E2E tests in `mobile/.maestro/`, at the Expo project root. `flows/` contains runnable YAML tests; `config.yaml` controls discovery. Jest component tests stay beside their components.

## Install the CLI

Maestro is a separate CLI, with no npm dependency or native test SDK to add to the app. Install Java 17 or newer, then follow the [official CLI installation guide](https://docs.maestro.dev/maestro-cli/how-to-install-maestro-cli). On macOS:

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
```

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

## Sample: Profile tab

`flows/profile.yaml` relaunches the app, waits for authenticated navigation, taps Profile, checks Account Settings, opens the edit form, verifies both fields, and cancels back to the profile. It uses native `testID` selectors for interactions and Maestro's built-in waits rather than fixed sleeps. It does not save profile changes.

The flow deliberately preserves app data with `clearState: false`: it requires an existing authenticated, onboarded session. If it times out waiting for `tab-profile`, check the API connection, sign in again, complete onboarding, and ensure Metro is serving the app. This smoke test does not cover login or onboarding.

Add further test YAML files under `flows/`. Keep reusable subflows in a sibling `helpers/` directory and call them with `runFlow` so they are not discovered as standalone tests.

## CI

This initial test is intended for a prepared local device. Before enabling it in CI, provide a native build, an emulator/simulator, a test backend/account, and an automated Auth0 login/setup flow. A fresh CI device has no session and cannot run this profile test alone. Once those prerequisites are automated, use the same commands and upload `.maestro/results/` even on failure.
