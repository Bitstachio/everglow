# Smoke suite

Run on every build handed to testers, and after any native rebuild. About 20 minutes on one device. It checks that the main paths work end to end, not every state; for that, run the [regression suite](regression-suite.md).

**Stop and report** if any P1 case fails: the build is not ready for wider testing.

## Before you start

- A build installed from the branch or release under test, pointing at the right API (local Docker, staging or production).
- One signed-in, onboarded test account with photos in the simulator or device library.
- A second account on another device for SM-09 (or skip it and note that).
- Optional: the local fixtures in [fixtures.sql](fixtures.sql) make SM-08 and SM-12 quicker.

## Cases

Run in order; later steps reuse what earlier ones created. IDs in brackets point to the full case in [test-cases.md](test-cases.md).

| #     | Check                                                                                                                                                            | Covers               | P   |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- | --- |
| SM-01 | Cold launch while signed in lands on Home without a sign-in prompt                                                                                               | [AUTH-01]            | P1  |
| SM-02 | Home lists your rolls in order (last day, open, upcoming, closed) and each opens                                                                                 | [HOME-01], [HOME-02] | P1  |
| SM-03 | New event: name a roll, keep the defaults, Load the roll; the Loaded envelope appears (or, at the free limit, "Both rolls are in use" appears before any typing) | [NEW-02] / [NEW-08]  | P1  |
| SM-04 | Send the envelope shows the QR code and Share the link opens the share sheet                                                                                     | [ENV-01], [ENV-03]   | P1  |
| SM-05 | On an open roll, the shutter picks 2 photos; both develop on the sheet and the band's storage goes up                                                            | [UP-01]              | P1  |
| SM-06 | Tap a frame: the photo opens full screen; Save puts it in Photos                                                                                                 | [VIEW-01], [VIEW-07] | P1  |
| SM-07 | Your own frame's menu offers Delete for everyone; deleting it removes it from the sheet                                                                          | [VIEW-03], [VIEW-06] | P1  |
| SM-08 | Roll settings on an upcoming roll lets you change the film; on an open roll When and Film say Locked                                                             | [RUN-03], [RUN-05]   | P1  |
| SM-09 | Second account opens the adds-photos envelope link and joins; the roll opens with "You're on the roll"                                                           | [JOIN-01]            | P1  |
| SM-10 | An invalid envelope link says "This envelope doesn't open"                                                                                                       | [JOIN-03]            | P1  |
| SM-11 | Roll call lists everyone with roles; reporting a person sends ("Report sent")                                                                                    | [PPL-01], [MOD-04]   | P1  |
| SM-12 | Cut a test roll, then delete it from settings; it leaves Home                                                                                                    | [RUN-07], [RUN-08]   | P1  |
| SM-13 | Your photo on Home opens the lab card; Username screen opens and Change stays disabled for the same handle                                                       | [YOU-01], [YOU-04]   | P2  |
| SM-14 | With the API stopped, relaunch: "The lab is out of reach"; start it again and Try again loads Home                                                               | [AUTH-08], [AUTH-09] | P1  |

## Recording

Note the build, device, OS and API in a run file under [runs/](runs/), mark each SM case Pass / Fail / Not run, and link any Linear bug.

[AUTH-01]: test-cases.md#auth--start-and-sign-in
[AUTH-08]: test-cases.md#auth--start-and-sign-in
[AUTH-09]: test-cases.md#auth--start-and-sign-in
[HOME-01]: test-cases.md#home--your-rolls
[HOME-02]: test-cases.md#home--your-rolls
[NEW-02]: test-cases.md#new--start-a-roll
[NEW-08]: test-cases.md#new--start-a-roll
[ENV-01]: test-cases.md#env--send-the-envelope
[ENV-03]: test-cases.md#env--send-the-envelope
[UP-01]: test-cases.md#up--add-photos
[VIEW-01]: test-cases.md#view--look-and-save
[VIEW-03]: test-cases.md#view--look-and-save
[VIEW-06]: test-cases.md#view--look-and-save
[VIEW-07]: test-cases.md#view--look-and-save
[RUN-03]: test-cases.md#run--run-the-roll-hosts
[RUN-05]: test-cases.md#run--run-the-roll-hosts
[RUN-07]: test-cases.md#run--run-the-roll-hosts
[RUN-08]: test-cases.md#run--run-the-roll-hosts
[JOIN-01]: test-cases.md#join--join-a-roll
[JOIN-03]: test-cases.md#join--join-a-roll
[PPL-01]: test-cases.md#ppl--people-the-roll-call
[MOD-04]: test-cases.md#mod--report-and-block
[YOU-01]: test-cases.md#you--you-the-lab-card-and-account
[YOU-04]: test-cases.md#you--you-the-lab-card-and-account
