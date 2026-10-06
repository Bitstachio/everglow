# Moderation runbook

What a platform moderator does when an alert fires. The design behind it is [docs/moderation.md](../../docs/moderation.md); this page is the procedure. Pending the legal review in EV-62, so check with the lawyer before relying on the legal parts.

## Before anything: who is a moderator

A platform moderator is an account with `User.platformRole = 'MODERATOR'`. No endpoint grants it. Grant and revoke it in the database, and keep the list short:

```sql
UPDATE "User" SET "platformRole" = 'MODERATOR' WHERE id = '<user id>';
UPDATE "User" SET "platformRole" = NULL WHERE id = '<user id>';
```

The role is checked on every request (`PlatformModeratorGuard`), so revoking it takes effect at once. Every `/admin` action is logged with the moderator's id.

## The tools

| Endpoint                                        | Does                                                                                                      |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `GET /admin/reports`                            | The platform's OPEN reports, oldest first. `?queue=ORGANIZERS`, `?status=`, `?eventId=` to look elsewhere |
| `GET /admin/reports/:reportId`                  | One report, with who filed it, why it is here and its evidence summary                                    |
| `POST /admin/reports/:reportId/evidence-url`    | A 5-minute link to what was reported. Every link is logged (`report.evidence.viewed`)                     |
| `PATCH /admin/reports/:reportId`                | `REMOVE_PHOTO`, `REMOVE_MEMBER` (with `photos`), or `DISMISS`. Closes every OPEN report on the target     |
| `PUT /admin/reports/:reportId/hold`             | `{ until, reason }`: keep the report and its evidence past the retention window                           |
| `DELETE /admin/reports/:reportId/hold`          | Release the hold                                                                                          |
| `PUT /admin/reports/:reportId/authority-report` | `{ reference, submittedAt? }`: record a CyberTipline or police report; holds it a year from submission    |
| `POST /admin/events/:eventId/lift-review`       | End an event's review                                                                                     |

**Look only as far as you need.** Open the evidence link only to decide, never forward it, never download it. The link is logged, and so is every read of the bucket by anyone but the API ([photo-privacy.md](../../docs/photo-privacy.md)).

## Every escalated report: within 24 hours

`report.escalated` raises a ticket, and `report.stale` fires once for any report that has waited 24 hours in the platform's queue.

1. Open it with `GET /admin/reports/:reportId`. `escalationReasons` says why it reached you.
2. Look at the evidence if the reason needs it.
3. Decide with `PATCH /admin/reports/:reportId`:
   - **Violates the terms:** `REMOVE_PHOTO` for a photo, `REMOVE_MEMBER` for a person (`photos: DELETE` to remove all their photos in the event). On a photo that is already gone, `REMOVE_PHOTO` upholds the report.
   - **Doesn't:** `DISMISS`. A photo hidden by its reports comes back.
4. For a report about the event itself, decide on the event, then `DISMISS` the report. Lift the review with `POST /admin/events/:eventId/lift-review` once you are done.

## Child safety (`child_safety`): pages, act now

A `CHILD_SAFETY` report is hidden from everyone, organizers included, and held for a year from the moment it was filed.

1. Look only as far as needed to judge whether it is apparent child sexual abuse material. Don't copy, forward or download it.
2. **If it is:**
   1. Report it to the **NCMEC CyberTipline** "as soon as reasonably possible" (18 U.S.C. §2258A). Use the provider account set up for Everglow. Registration is a one-time task for the owner.
   2. For a Canadian user or event, report it to **Cybertip.ca**, and notify the police (S.C. 2011, c. 4).
   3. Record the reference: `PUT /admin/reports/:reportId/authority-report` with `{ reference, submittedAt }`. That holds the report and its evidence for a year from the submission.
   4. Remove the content: `PATCH` with `REMOVE_MEMBER` and `photos: DELETE`. The evidence copy is kept under the hold.
   5. Tell nobody involved why. Nothing the person sees may prejudice an investigation.
3. **If it isn't:** `DISMISS` it. If it is still objectionable, use the ordinary verdicts instead.

## Intimate image shared without consent (`intimate_image`): pages, 48 hours

The TAKE IT DOWN Act requires removal within 48 hours of a valid request (47 U.S.C. §223a). The report hides the image from everyone at once; the clock runs from the report's `createdAt`.

1. Check it is plausibly the person shown asking. A request by the person shown is enough. You don't have to prove it.
2. `PATCH` with `REMOVE_PHOTO`. Removing it also deletes its evidence copy and keeps only the hash, so we don't hold a copy of the image the person asked us to remove.
3. Requests from someone who isn't a member arrive through the website form (planned). File them as reports on their behalf.

## Law enforcement and legal requests

- **Preservation request** (18 U.S.C. §2703(f), 90 days, renewable): find the reports involved and `PUT .../hold` with `reason: LAW_ENFORCEMENT` until the requested date.
- **Legal process for content:** content goes only to police or a court, under the process they send (Stored Communications Act §2702). Get the lawyer's sign-off first.
- **A victim asking for proof:** confirm what they reported and when. Content goes only to police or a court.

## Retention

- Closed reports and their evidence are deleted a year after they close (`REPORT_RETENTION_DAYS`), by the evidence job (`MODERATION_EVIDENCE_JOB_ENABLED`).
- A hold keeps them until its `holdUntil`. Review holds every quarter and release the ones that have lapsed.
