# Run 2026-11-10 · iOS simulator · exploratory

The first pass against the full set of drawings: an exploratory run that also wrote [test-cases.md](../test-cases.md). It covers what one signed-in account can reach on a simulator with database fixtures. Cases that need a fresh sign-in, a second device, a camera or push were not run.

## Environment

|         |                                                                                                       |
| ------- | ----------------------------------------------------------------------------------------------------- |
| Commit  | `main` at `488ffd73`                                                                                  |
| Build   | Debug, `expo run:ios`, Metro dev server                                                               |
| Device  | iPhone 16 Pro simulator, iOS 18.4                                                                     |
| API     | Local Docker (`api/docker-compose.yml`), `http://localhost:3000`                                      |
| Account | One onboarded account (host of two rolls, guest on others); seeded users Leila Haddad and Marcus Bell |
| Data    | [fixtures.sql](../fixtures.sql) plus the join-refusal block                                           |

## Summary

161 cases written; 89 are P1.

| Result                 | Cases |
| ---------------------- | ----- |
| Pass                   | 42    |
| Partial                | 7     |
| Fail                   | 6     |
| Gap (drawn, not built) | 4     |
| Not run                | 102   |

Automated suites on the same commit: `pnpm test` 141 suites, 958 tests, all passing. `pnpm test:integration`: 13 of 14 suites pass; `event-detail-screen.integration.test.tsx` failed one saving test in each of 4 runs, a different one each time ([EV-225](https://linear.app/mehrshadfb/issue/EV-225)).

What looked right: Home ordering and closed rolls; every roll state (upcoming, empty, last day, under review, suspended, closed); host and guest menus; envelope with QR; all seven join refusals and unblock-and-join; the free-plan limit screen; roll settings before and after opening; cut and delete; the lab card and delete-account screen; recovery after the API went away.

## Defects

| Linear                                                         | P      | Summary                                                                                                                                                                                      | Cases                     |
| -------------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| [EV-222](https://linear.app/mehrshadfb/issue/EV-222)           | High   | A photo without a thumbnail shows as a blank, unnumbered frame on the sheet, filmstrip and menu; no fallback to the photo. The viewer answered taps 5–10 s late on those rolls (debug build) | HOME-08, VIEW-01, VIEW-12 |
| [EV-223](https://linear.app/mehrshadfb/issue/EV-223)           | Medium | "Hosted by" names the creator after they stop being host; while the roll call loads the creator is treated as host and the app requests host-only reports (`403 ORGANIZER_ONLY`)             | ROLL-07, ROLL-15          |
| [EV-224](https://linear.app/mehrshadfb/issue/EV-224)           | Low    | Username screen says "Taken" for an invalid or rate-limited handle                                                                                                                           | YOU-05                    |
| [EV-225](https://linear.app/mehrshadfb/issue/EV-225)           | Medium | Flaky saving tests in the roll screen integration suite                                                                                                                                      | —                         |
| [EV-204](https://linear.app/mehrshadfb/issue/EV-204) (comment) | —      | Accounts onboarded before terms existed can create and join rolls without accepting terms                                                                                                    | ONB-11                    |

## Gaps against the drawings

Drawn but not in the app. These are for product to confirm, not bugs:

- **Copy link** on the envelope (the share sheet's Copy works) · ENV-04
- **Notes** row in You, and **notes for this roll** in the guest menu (push registration shipped in #296) · YOU-02, LEAVE-01
- **Email** change in You; the row is read-only · YOU-07
- Username screen doesn't say how many changes are left · YOU-04
- Seeing one person's frames from the roll call is not on `main` yet (EV-182) · PPL-08

## Observations

- The free-plan limit counts rolls you **created**, not rolls you host. A creator later made a guest still has the roll counted and is told to cut it from settings, which a guest can't do (NEW-08). Needs a product decision.
- Reporting a person you already reported returns 201 but keeps the first report and reason (MOD-04). The app is consistent with that.
- A closed roll's envelope reads "2 people **so far**" (JOIN-06); the drawing just says "11 people".
- "You're already on this roll" was not seen when opening your own roll's link (JOIN-04); it may be a short toast. Recheck.
- Save showed no confirmation in the screenshots, although the photo did land in Photos (VIEW-07). Recheck.

## Setup notes for the next run

- The first build failed at `pod install` with `Unicode Normalization not appropriate for ASCII-8BIT`; exporting `LANG=en_US.UTF-8` fixed it. Now in the [README](../README.md).
- Opening `localhost:8081` in a browser made Metro build web bundles (about 90 s each, failing on a native-only module) and slowed the native build. Don't.
- The roll page's envelope and settings read invite tokens from the cached event; relaunch the app after changing rows in the database.
- Local data changed during this run: fixture rolls were created; "QA · Last day" was cut and deleted; the test account left five fixture rolls, was banned from one and joined one; a host block was added and removed. Clean up with the commands at the top of [fixtures.sql](../fixtures.sql).
