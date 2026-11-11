# Manual QA

How to test the Everglow mobile app by hand: what to check on each screen, which checks to run on every build, and which before a release. Automated tests are described in [Testing](../testing.md) and [E2E (Maestro)](../e2e.md); this folder covers what they don't.

| File                                       | Use it for                                                            |
| ------------------------------------------ | --------------------------------------------------------------------- |
| [test-cases.md](test-cases.md)             | Every test case, by area, with steps, expected result and last result |
| [smoke-suite.md](smoke-suite.md)           | The short pass for every build handed to testers (about 20 minutes)   |
| [regression-suite.md](regression-suite.md) | The full pass before a release or after a large change (half a day)   |
| [fixtures.sql](fixtures.sql)               | Local database fixtures: one roll in each lifecycle state             |
| [runs/](runs/)                             | One file per test run: environment, results, defects found            |

The cases follow the contact-sheet drawings (`design/flow-NN.html`, a local copy; see [AGENTS.md](../../../AGENTS.md)). Each area in `test-cases.md` names the drawing chapter it checks by title. When a drawing and the app disagree, decide which one is right before you log a bug: a drawing can be ahead of the app on purpose (marked "Needs API" or "Later" on the sheet).

## Test case IDs

`AREA-NN`, stable once published. Do not renumber; retire a case by marking it **Retired** with the reason.

| Prefix | Area                                                                    | Drawing chapter   |
| ------ | ----------------------------------------------------------------------- | ----------------- |
| AUTH   | Start and sign in                                                       | Start and sign in |
| ONB    | Onboarding                                                              | Onboarding        |
| HOME   | Your rolls                                                              | Home              |
| NEW    | Start a roll                                                            | Start a roll      |
| ENV    | Send the envelope                                                       | Send the envelope |
| JOIN   | Join a roll                                                             | Join a roll       |
| ROLL   | The roll page, every role and state                                     | The roll          |
| UP     | Add photos                                                              | Add photos        |
| VIEW   | Look and save                                                           | Look and save     |
| MOD    | Report and block                                                        | Report and block  |
| PPL    | People: the roll call                                                   | People            |
| RUN    | Run the roll (hosts)                                                    | Run the roll      |
| LEAVE  | Leave a roll (guests)                                                   | Leave a roll      |
| YOU    | You: the lab card and account                                           | You               |
| X      | Cross-cutting: offline, session, deep links, accessibility, performance | —                 |

**Priority**: **P1** blocks a release (core path, data loss, privacy, safety). **P2** a visible feature is wrong. **P3** polish, copy, rare edge.

**Result**: **Pass**, **Fail** (with the Linear key), **Partial** (part verified; the note says which part), **Blocked** (could not set up), **Not run** (with the reason).

## Environment

1. Start the API and database: `docker compose up` in `api/` (see [api/docs/local-setup.md](../../../api/docs/local-setup.md)). The API listens on `localhost:3000`.
2. In `mobile/`, set `EXPO_PUBLIC_API_URL=http://localhost:3000` in `.env`.
3. Build and install the native app: `pnpm install --frozen-lockfile`, then `pnpm ios`. If `pod install` fails with `Unicode Normalization not appropriate for ASCII-8BIT`, export `LANG=en_US.UTF-8` and `LC_ALL=en_US.UTF-8` and run again. Rebuild whenever a native module changes; a JavaScript reload is not enough.
4. Keep Metro running (`pnpm start`). Do not open `localhost:8081` in a browser: it makes Metro build a web bundle that this app can't use, and slows everything down.
5. Sign in on the simulator with a test account and finish onboarding. Testers sign in themselves; never put shared passwords in these docs.

Use an iPhone simulator on iOS 18 for routine runs; it is noticeably quicker than the iOS 27 runtime. Before a release, repeat the smoke suite on a physical iPhone and an Android device.

### Test data

Most of the regression suite needs rolls in states that take days to reach. Load [fixtures.sql](fixtures.sql) into the local database (instructions are at the top of the file). It creates, around your account:

| Roll                  | Your role         | State                        |
| --------------------- | ----------------- | ---------------------------- |
| QA · Upcoming (host)  | Host              | Opens in 2 days              |
| QA · Upcoming (guest) | Adds photos       | Opens tomorrow               |
| QA · Last day         | Host (with Leila) | Closes in 5 hours, no photos |
| QA · View only        | View only         | Open                         |
| QA · Closed           | Adds photos       | Closed 13 days ago           |
| QA · Under review     | Adds photos       | Open, under review           |
| QA · Suspended        | Adds photos       | Open, suspended              |

Rolls that need photos (thumbnails, saving, selection, reports on a frame) use real uploads: add them from the app with the simulator's photo library. Fixture rows have no S3 objects behind them.

Open any screen directly with a deep link instead of scrolling, for example:

```bash
xcrun simctl openurl booted "everglowmobile:///events/<eventId>/settings"
xcrun simctl openurl booted "everglowmobile:///join/<envelope token>"
```

The app caches what it last loaded. After changing rows in the database, relaunch the app (`xcrun simctl terminate booted com.anonymous.everglow-mobile`, then open it) before checking the screen.

Some cases need a second person on another device or simulator signed in as another account (marked **2 devices**). Push notifications need a physical device.

## Logging a run

Copy the latest file in [runs/](runs/), rename it `YYYY-MM-DD-<platform>.md`, and fill in the environment, the result of each case you ran, and the defects. File each new defect in Linear with the Bug template in [.context/linear-issue-generator.md](../../../.context/linear-issue-generator.md) (labels `Bug` and `Mobile`) and put its key in the run file. Update the **Last result** column in `test-cases.md` in the same PR as the run file.
