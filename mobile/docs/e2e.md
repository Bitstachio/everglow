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

`helpers/login.yaml` taps `login-submit`, drives Auth0 Universal Login with `E2E_EMAIL` / `E2E_PASSWORD`, and waits for `events-profile-button`. It is not discovered as its own test; `flows/login-smoke.yaml` calls it after `clearState: true`. Seeded users (`api` `pnpm run seed:staging-e2e`) skip onboarding.

## CI

GitHub Actions workflow [`.github/workflows/macos-smoke.yml`](../../.github/workflows/macos-smoke.yml) (`workflow_dispatch`) builds a Release iOS simulator binary (no Metro), then runs `pnpm test:e2e:login:ios`.

Required repository secrets:

| Secret | Purpose |
| --- | --- |
| `E2E_EMAIL` / `E2E_PASSWORD` | Seeded Auth0 user for Universal Login |
| `EXPO_PUBLIC_API_URL` | Public HTTPS API (not `localhost`); Auth0 on that API must match the mobile tenant |
| `EXPO_PUBLIC_AUTH0_DOMAIN` | Native app Auth0 domain |
| `EXPO_PUBLIC_AUTH0_CLIENT_ID` | Native app client id |
| `EXPO_PUBLIC_AUTH0_AUDIENCE` | API audience (same as API `AUTH0_AUDIENCE`) |

```sh
gh workflow run macos-smoke.yml --ref <branch-with-workflow>
```

Artifacts upload `.maestro/results/` (including failures).
