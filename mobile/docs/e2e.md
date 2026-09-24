# E2E tests (Maestro)

This document covers end-to-end testing for the Everglow mobile app: what we use, where flows live, and how to set up a machine to run them. It is not a Maestro tutorial; use the [official Maestro docs](https://docs.maestro.dev/) for flow syntax.

**Convention hierarchy:** E2E work follows [codebase conventions](./code-conventions.md). Flows live under `mobile/.maestro/` next to the Expo app; component tests stay beside their components and use Jest / RNTL (see [Testing](./testing.md)).

**Tool:** [Maestro](https://maestro.dev/) — a separate CLI (not an npm dependency). Flows are YAML under `.maestro/`; `config.yaml` controls discovery.

**Flows:** see [Coverage](#coverage). Profile / Account Settings is only smoke-tested until that area is finished.

## Layout

| Path                   | Role                                                   |
| ---------------------- | ------------------------------------------------------ |
| `.maestro/config.yaml` | Flow discovery (`flows/**`)                            |
| `.maestro/flows/`      | Runnable YAML tests                                    |
| `.maestro/helpers/`    | Optional reusable subflows (`runFlow`); not standalone |
| `.maestro/assets/`     | Fixture media (photo used by the photos flow)          |
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

Validate a flow's syntax without a device:

```sh
maestro check-syntax .maestro/flows/create-event.yaml
```

## Coverage

Every flow creates its own event with a run-unique title (`E2E <timestamp>`) and deletes it at the end, so runs do not depend on existing account data or collide with each other. A failed run can leave an `E2E …` event behind; delete it from My Events.

| Flow                | Tags                 | Covers                                                                                                                   |
| ------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `home.yaml`         | smoke, events        | Events home content, pull to refresh, See all → My Events, Create Event → Back                                           |
| `create-event.yaml` | events, create-event | Required-title validation, date/time pickers open and close, create with description, confirmation, Copy, Create another |
| `event-detail.yaml` | events, event-detail | Done, organizer details, refresh, members sheet, edit cancel / validation / save, delete cancel / confirm                |
| `share-event.yaml`  | events, share-event  | Share action on a card, invitation sheet, Copy, Close / X, native share sheet handoff                                    |
| `join-event.yaml`   | events, join-event   | Join sheet, empty validation, invalid invite error, field reset on close, pasting a real invite link                     |
| `events-list.yaml`  | events, events-list  | Sort toggle, filter sheet role chips, date picker, organizer / participant filters, reset, close vs apply                |
| `event-photos.yaml` | events, photos       | Upload from the photo library, download, delete cancel / confirm (iOS picker only)                                       |
| `qr-scanner.yaml`   | camera, join-event   | Scanner or permission prompt opens and closes; excluded by default, run by path on a physical device                     |
| `profile.yaml`      | smoke, profile       | Events avatar → Account Settings → Back                                                                                  |

Not covered: login, signup, and onboarding (Auth0 hosted login; the suite assumes an existing session), leaving an event and removing members (need a second account), and scanning a real QR code.

Helpers in `helpers/`:

| Helper                    | Role                                                                            |
| ------------------------- | ------------------------------------------------------------------------------- |
| `launch-home.yaml`        | Relaunch with the saved session and wait for Events home                        |
| `unique-title.yaml`       | Set `output.title` to a run-unique event title                                  |
| `create-event.yaml`       | Create an event (`TITLE`, optional `DESCRIPTION`) and wait for the confirmation |
| `open-event.yaml`         | Scroll to and open the event titled `TITLE`                                     |
| `delete-open-event.yaml`  | Delete the open event and leave the details screen                              |
| `dismiss-alert.yaml`      | Wait for the native alert titled `TITLE` and tap OK                             |
| `dismiss-dev-banner.yaml` | Dismiss the debug LogBox banner that covers bottom-anchored buttons             |
| `allow-permission.yaml`   | Accept a runtime permission prompt if one is showing                            |
| `go-back.yaml`            | Native back on iOS or Android                                                   |

Device notes:

- The photos flow needs an API whose storage accepts uploads; it adds `assets/e2e-photo.jpg` to the device library with `addMedia`.
- The iOS share sheet runs out of process and is not in Maestro's view hierarchy, so the flow only checks that the app returns to the invitation after the sheet is swiped away.
- Maestro's `pasteText` only pastes text Maestro copied itself, so the join flow pastes the app-copied invite link through the native long-press Paste menu.
- Bottom sheets do not avoid the keyboard; flows press Return instead of `hideKeyboard`, which can tap the scrim and close the sheet.

## Sample: Events → Account Settings

`flows/profile.yaml` relaunches the app, waits for authenticated navigation, taps the Events avatar, checks the Account Settings stub, and uses Back to return to Events. It uses native `testID` selectors for interactions and Maestro's built-in waits rather than fixed sleeps. It does not save profile changes.

The flow deliberately preserves app data with `clearState: false`: it requires an existing authenticated, onboarded session. If it times out waiting for `events-profile-button`, check the API connection, sign in again, complete onboarding, and ensure Metro is serving the app. This smoke test does not cover login or onboarding.

Add further test YAML files under `flows/`. Keep reusable subflows in a sibling `helpers/` directory and call them with `runFlow` so they are not discovered as standalone tests.

## CI

This initial test is intended for a prepared local device. Before enabling it in CI, provide a native build, an emulator/simulator, a test backend/account, and an automated Auth0 login/setup flow. A fresh CI device has no session and cannot run this profile test alone. Once those prerequisites are automated, use the same commands and upload `.maestro/results/` even on failure.
