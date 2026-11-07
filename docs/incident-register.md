# Confidentiality incident register

Quebec's Law 25 asks every business that holds personal information to keep a **register of confidentiality incidents** (Act respecting the protection of personal information in the private sector, s. 3.8), and to give it to the Commission d'accès à l'information (CAI) when asked. PIPEDA asks the same of breaches of security safeguards (s. 10.3). This page says what counts as an incident, where the register is kept, what each entry records and who is told. The public promise is in the [privacy policy](https://everglow.social/en/privacy#quebec). Pending the legal review in [EV-62](https://linear.app/mehrshadfb/issue/EV-62).

## What counts

A confidentiality incident is any access to, use of or disclosure of personal information the law doesn't allow, its loss, or any other breach of its protection (Law 25, s. 3.6). Every one is entered, however small, including ones that turn out harmless. For Everglow that includes:

- an alert from [photo-privacy.md](./photo-privacy.md) that was not a known, approved action: a person reading or trying to read a photo, or a change to the bucket policy, the KMS key, the trail or the image processor;
- an evidence link (`POST /admin/reports/:reportId/evidence-url`) opened by someone who should not have, or forwarded;
- a leaked credential: the API's AWS key, an Auth0 management secret, `DATABASE_URL`, or a moderator account;
- a copy of a database or bucket outside its environment, or on a lost or stolen device;
- an incident reported to us by a service provider (AWS, Auth0, the database host, Resend, Cloudflare, GitHub);
- personal information sent to the wrong person, such as a reply to a privacy request.

## Where it is kept

In a private register outside this repository, kept by the person in charge of the protection of personal information (the privacy officer, reached at `privacy@everglow.social`). The repository is public, so no entry, and no detail of an open incident, goes in a commit, an issue, a PR or a log message. A Linear issue may track the technical fix, with a link to the entry and nothing personal in it.

Entries are kept for at least **5 years** after the date we learned of the incident (Regulation respecting confidentiality incidents, s. 7), which also covers PIPEDA's 24 months.

## What each entry records

From the Regulation respecting confidentiality incidents (s. 6):

| Field | What to write |
| ----- | ------------- |
| Information involved | What personal information, or why that can't be known |
| What happened | A short description of the circumstances, and its cause if known |
| When | The date or period of the incident, or an estimate |
| When we learned of it | The date, and how (an alert, a provider, a user) |
| People affected | How many, or an estimate; whether any are in Quebec |
| Risk assessment | Whether there is a risk of serious injury: how sensitive the information is, how it could be misused, and how likely that is. Under PIPEDA the same test is a real risk of significant harm |
| Notices | If there is a risk: the dates the CAI, the Office of the Privacy Commissioner of Canada and the people affected were told, and whether a public notice was given and why |
| Measures | What was done to reduce the risk of harm and to stop it happening again |

## Who is told

1. **At once:** the privacy officer, who opens the entry and leads the response. Steps that reduce the harm (revoking a key, removing a link, suspending a moderator) don't wait for the assessment.
2. **If there is a risk of serious injury** (Law 25, s. 3.5): the **CAI**, with its form, and **each person affected**, promptly. A public notice replaces individual ones only where the law allows it.
3. **If there is a real risk of significant harm** (PIPEDA, s. 10.1): the **Office of the Privacy Commissioner of Canada** and each person affected, as soon as feasible.
4. **US residents affected:** the notices their state's breach law requires, and the state attorney general where it asks for one.
5. **Anyone who can reduce the harm**, such as a service provider or the police, with only the information they need.

Notices to the people affected say in plain words what happened, what information was involved, what we did, and what they can do, per [voice.md](./voice.md).

## Reviewing the register

The privacy officer reviews the register every quarter, with the moderation holds ([moderation-runbook.md](../api/docs/moderation-runbook.md#retention)), and looks for repeats that need a fix beyond the single incident.
