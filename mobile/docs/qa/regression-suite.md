# Regression suite

The full manual pass before a release, after a large change, or after a dependency or native upgrade. About half a day on one iOS device; repeat the [smoke suite](smoke-suite.md) on Android and a physical iPhone. Every case is defined in [test-cases.md](test-cases.md); this file says which to run, in what order, and what the run needs.

## Entry criteria

- `pnpm test` and `pnpm test:integration` pass on the build's commit (known flaky: [EV-225](https://linear.app/mehrshadfb/issue/EV-225)).
- The [smoke suite](smoke-suite.md) passed on this build.
- Fixtures loaded from [fixtures.sql](fixtures.sql); the join-refusal block at the end of that file is run just before pass 5.
- Test accounts: **A** (main, onboarded), **B** (second device), **C** (brand new email for onboarding), **D** (throwaway for account deletion), and one Apple or Google account on a physical device.

## Exit criteria

- Every P1 case passes, or has a Linear bug that the release owner has accepted in writing.
- No open Urgent or High bug in the Mobile area for this release.
- The run file in [runs/](runs/) lists every case with its result.

## Passes

Run the passes in order. Each pass lists its cases by ID; P1 cases are in **bold**.

### 1. Sign in and onboarding (account C, then A)

**AUTH-02**, **AUTH-03**, **AUTH-04**, AUTH-05, AUTH-06, AUTH-07, **AUTH-10**, AUTH-11,
**ONB-01**, **ONB-02**, ONB-03, ONB-04, **ONB-05**, ONB-06, ONB-07, ONB-08, **ONB-09**, **ONB-10**, ONB-11

### 2. Home and starting a roll (account A)

**AUTH-01**, **HOME-01**, **HOME-02**, HOME-03, HOME-04, HOME-05, HOME-06, HOME-07, HOME-08, HOME-09, HOME-10,
**NEW-01**, **NEW-02**, NEW-03, NEW-04, NEW-05, NEW-06, NEW-07, **NEW-08**, NEW-09

### 3. The envelope (A as host)

**ENV-01**, **ENV-02**, **ENV-03**, ENV-04, **ENV-05**, ENV-06, ENV-07, **ENV-08**, ENV-09

### 4. The roll in every state (A, fixtures)

**ROLL-01**, **ROLL-02**, ROLL-03, **ROLL-04**, **ROLL-05**, **ROLL-06**, **ROLL-07**, **ROLL-08**, **ROLL-09**, **ROLL-10**, **ROLL-11**, **ROLL-12**, ROLL-13, ROLL-14, ROLL-15, ROLL-16

### 5. Joining (A and B)

Run the join-refusal block from [fixtures.sql](fixtures.sql) first.

**JOIN-01**, **JOIN-02**, **JOIN-03**, **JOIN-04**, JOIN-05, JOIN-06, JOIN-07, JOIN-08, **JOIN-09**, **JOIN-10**, **JOIN-11**, **JOIN-12**, JOIN-13, JOIN-14, JOIN-15

### 6. Photos: add, look, save (A and B on one open roll)

**UP-01**, **UP-02**, UP-03, **UP-04**, UP-05, UP-06, UP-07, **UP-08**, **UP-09**, UP-10,
**VIEW-01**, **VIEW-02**, **VIEW-03**, **VIEW-04**, **VIEW-05**, **VIEW-06**, **VIEW-07**, VIEW-08, VIEW-09, VIEW-10, **VIEW-11**, VIEW-12

### 7. Safety: report and block (A, B and a third member)

**MOD-01**, MOD-02, **MOD-03**, **MOD-04**, **MOD-05**, **MOD-06**, **MOD-07**, **MOD-08**, MOD-09, **MOD-10**, MOD-11

### 8. People and running the roll (A as host, B as guest)

**PPL-01**, **PPL-02**, **PPL-03**, **PPL-04**, **PPL-05**, PPL-06, **PPL-07**, PPL-08,
**RUN-01**, **RUN-02**, **RUN-03**, **RUN-04**, **RUN-05**, RUN-06, **RUN-07**, **RUN-08**, **RUN-09**, RUN-10, RUN-11,
**LEAVE-01**, **LEAVE-02**, **LEAVE-03**

### 9. Account (A, then D for deletion)

**YOU-01**, YOU-02, **YOU-03**, **YOU-04**, YOU-05, YOU-06, YOU-07, **YOU-08**, YOU-09, YOU-10, **YOU-11**, **YOU-12**, **YOU-13**, **YOU-14**, YOU-15

### 10. Cross-cutting

**X-01**, **X-02**, X-03, X-04, X-05, X-06, X-07, X-08, X-09, X-10

## What automation already covers

Manual runs can go faster where these pass, but still run the P1 cases by hand on a device:

| Area                                                     | Automated by                                                                           |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Login and account settings                               | Maestro: `mobile/.maestro/flows/login-smoke.yaml`, `profile.yaml`                      |
| Roll page states, closing, delete, leave, notes question | `features/events/screens/event-detail-screen.integration.test.tsx`                     |
| Join refusals and sealed envelopes                       | `features/events/screens/join-envelope-screen.integration.test.tsx`                    |
| Envelope and reset                                       | `features/events/screens/envelope-screen.integration.test.tsx`                         |
| New roll, limit, leave unsaved                           | `features/events/screens/new-roll-screen.integration.test.tsx`                         |
| Settings and locked schedule                             | `features/events/screens/event-settings-screen.integration.test.tsx`                   |
| Cut and can't-delete                                     | `cut-roll-screen.integration.test.tsx`, `cant-delete-roll-screen.integration.test.tsx` |
| Reporting and host review                                | `features/moderation/screens/*.integration.test.tsx`                                   |
| Blocked people, account settings                         | `features/profile/screens/*.integration.test.tsx`                                      |

Good candidates for new Maestro flows, since they are P1 and repeated every release: SM-03, SM-05, SM-06 and SM-12.
