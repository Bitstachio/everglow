# Free and paid plans

The business model Everglow is going forward with. The **free plan is decided**. The **paid plans are proposed**: they come later, and their prices will be set from real usage.

It replaces the personal 5 GB storage limit with limits per event; [photos-architecture.md](./photos-architecture.md) §9 covers how gallery storage is enforced. Implementation is [EV-64](https://linear.app/mehrshadfb/issue/EV-64), and choosing the gallery length and deactivating events are [EV-103](https://linear.app/mehrshadfb/issue/EV-103); this doc is [EV-67](https://linear.app/mehrshadfb/issue/EV-67).

## Principles

- **The host pays, guests never do.** Joining an event is always free, whatever the plan.
- **Limits follow the event, not the person.** Each event has a plan, and upgrading one event doesn't change the others.
- **Galleries close.** After the window, the photos are removed and the event itself stays (title, members, cover). Members download before that.

## Free (decided)

| Limit                           | Free                                                     |
| ------------------------------- | -------------------------------------------------------- |
| Active events at once           | 2                                                        |
| Members per event               | 30                                                       |
| Gallery storage per event       | 3 GB                                                     |
| How long the gallery stays open | 3 days, 1 week, 2 weeks or 30 days, picked when creating |

- **Active** means the event is upcoming or its gallery is open: an event counts from the moment you create it until its gallery closes or you deactivate it. Only events you created count; events you joined don't. There's no weekly allowance, so a busy weekend is fine as long as no more than 2 are active at once.
- **Gallery storage** is the one limit on what a gallery holds: everything uploaded to the event, by everyone, counts toward its 3 GB. There's no limit on the number of photos. The app shows storage as it is, "1.2 GB of 3 GB", and never turns it into an estimated number of photos.
- Photos upload as they are. Whether to compress some of them before upload is undecided ([EV-94](https://linear.app/mehrshadfb/issue/EV-94)).
- **The gallery length** is picked when the event is created: 3 days, 1 week, 2 weeks or 30 days, 30 by default. The gallery opens on the event's date, or as soon as the event is created if that date has passed, and stays open that long. Creating an event a month ahead doesn't lengthen its gallery, and a past date doesn't shorten it. The date can be at most 12 months ahead.
- **An upcoming event** is one whose gallery hasn't opened yet. People can join it and see its details, invites and cover, but nobody can upload (`EVENT_GALLERY_NOT_OPEN`). Its date and gallery length can still change; the gallery then opens on the new date, or right away if that date has passed. Once the gallery opens, both are locked (`EVENT_SCHEDULE_LOCKED`). A longer gallery will be a paid upgrade.
- **When the gallery closes**, uploads stop and the photos are removed, by an hourly job ([photos-architecture.md](./photos-architecture.md) §12). A photo with an open report is kept, hidden, until the report is resolved. The event stays, doesn't count toward the 2 anymore, and can't be reopened.
- **Deactivating** an event (`POST /events/:eventId/deactivate`) closes its gallery now: for a host who is done early, or who needs the place for a new event. Only organizers can do it, upcoming events included. Uploads, joins and invite links stop, the photos are hidden at once and removed within the hour (those with open reports are kept, as on any close), and the event stops counting toward the 2 straight away. It can't be undone, and the event shows who deactivated it. Deactivating an event that has already closed changes nothing.
- **Deleting** an event removes it for everyone. It's possible only once the event is deactivated or its gallery has closed (`EVENT_STILL_ACTIVE`), the way WhatsApp asks you to exit a group before deleting it. Moderation has to finish first: an event under review (`EVENT_UNDER_REVIEW`) or with any open report (`EVENT_HAS_OPEN_REPORTS`) can't be deleted ([moderation.md §7](./moderation.md#7-evidence-deletes-and-retention)). Deactivating stays allowed, so the event still stops counting toward the 2.
- **A closed event**, whether it closed on schedule or was deactivated, stays in its members' lists, marked closed, with its details and members. Members can remove it from their list (leaving it), and organizers can delete it for everyone. What it no longer allows:
  - **seeing photos**: from the close time on, its photos aren't listed or opened for anyone, organizers included, even before the close job removes them;
  - **joining**: the invite links stop working (`EVENT_GALLERY_CLOSED`), and event responses list no invites;
  - **new invite links**: regenerating one is refused;
  - **a new date or gallery length**: both are locked once the gallery opens. The title, description and cover can still change;
  - **deleting photos on leave**: `?photos=DELETE` is ignored, so photos kept as evidence (open reports) can't be removed by a member.
- **Members** counts every role, organizers included.

### When a limit is reached

The API refuses with a 403 and a `code`, and the error carries nothing else. The app takes the numbers for its copy from two places, which share one shape: a `plan`, its `limits` (null for no limit), and the `usage` counted the same way.

- **An event** carries its own: `limits.members` and `limits.storageBytes`, with `usage` for both (storage in bytes, as a decimal string).
- **`GET /users/me/limits`** has the account's: `limits.activeEvents` and `usage.activeEvents`, plus `nextClosingEvent` (`id`, `title`, `galleryClosesAt`), the active event whose gallery closes first and frees a place, or null. Its `newEvent` lists what the create form offers: the plan a new event gets, its gallery lengths, the default, and the latest date it can have.

| Code                          | When                                                                                  |
| ----------------------------- | ------------------------------------------------------------------------------------- |
| `ACTIVE_EVENT_LIMIT_REACHED`  | Creating a 3rd event while 2 you created are still open                               |
| `EVENT_MEMBER_LIMIT_REACHED`  | Joining an event that has 30 members, through any role's invite                       |
| `EVENT_STORAGE_LIMIT_REACHED` | An upload batch that would take the gallery past its 3 GB (uploads in progress count) |
| `EVENT_GALLERY_CLOSED`        | Uploading to a gallery whose close time has passed                                    |
| `EVENT_GALLERY_NOT_OPEN`      | Uploading to an upcoming event, before its gallery opens                              |
| `EVENT_SCHEDULE_LOCKED`       | Changing the date or the gallery length after the gallery has opened                  |
| `EVENT_STILL_ACTIVE`          | Deleting an event that isn't deactivated and whose gallery hasn't closed              |
| `EVENT_HAS_OPEN_REPORTS`      | Deleting an event while any report about it, its photos or its members is open        |

Concurrent requests can't slip past a limit. Creates by the same person, and joins to the same event, take a Postgres advisory lock for their count and insert. Upload batches share the reservation's Serializable transaction.

## Paid (proposed, later)

**First: a one-time upgrade for a single event.** It's an in-app purchase by the host, and Apple takes 15% under the Small Business Program.

|                 | Free    | **Plus**              | **Celebration**                                |
| --------------- | ------- | --------------------- | ---------------------------------------------- |
| Price           | $0      | ~$5–10 per event      | ~$30–50 per event                              |
| Gallery storage | 3 GB    | 15 GB                 | 50 GB                                          |
| Members         | 30      | 100                   | Unlimited (fair use)                           |
| Longest gallery | 30 days | 90 days               | 1 year, then an optional yearly "keep forever" |
| Videos          | –       | Up to 1 minute each   | Up to 3 minutes each                           |
| Extras          | –       | Download all as a zip | Everything in Plus, live slideshow, co-hosts   |
| For             | Friends | Bigger parties        | Weddings                                       |

Storage is the limit on every plan, so videos simply take more of it. Each tier is about five times the one below. Each plan offers its own gallery lengths up to its longest, for example 3 days to 90 days on Plus and 1 week to 1 year on Celebration, defaulting to the longest.

**Later: a subscription** (~$4/month or ~$30/year) for people who host often: more active events at once, and every event at Plus level. We add it only once the data shows people buying Plus several times a year.

Why per event first: the whole category charges this way (POV, Kululu, GuestPix, GuestCam charge $5–$99 per event), because most people have a big event only a few times a year and a monthly fee feels wrong to them.

## What the first build includes

1. **Limits stored per event, as its plan**, not as constants in code. A paid tier then means a different plan on the event, and the numbers can change without a release.
2. **A warning before the gallery closes**, 1 day before, and 7 days before for galleries open 14 days or more, with "download all".
3. **Usage tracking:** storage used, members and downloads per event. These set the paid prices.
4. **Reported photos are kept when a gallery closes**, for the retention window in [EV-61](https://linear.app/mehrshadfb/issue/EV-61), so closing a gallery never destroys evidence.

## How it's built

**Plans are a versioned catalog in the database.** Each event points at the plan version it was created on, so a paid plan, or a change to a plan, is a data change, not a refactor, and never changes events already created or sold.

- **`Plan`** rows hold a plan's terms: `code` (`FREE` today; Plus and Celebration later) and `version`, plus one column per kind of limit: `memberLimit`, `storageLimitBytes`, `galleryWindowDays` (the longest gallery), and `galleryWindowOptions` (the lengths a host can pick, in days; a check constraint keeps `galleryWindowDays` the longest of them). Null means no limit. A new kind of limit (videos allowed, longest video, …) is a new column here, never on `Event`. The free plan's lengths arrived in its version 2; events created before it keep version 1's fixed 30 days.
- **Plan rows never change.** A database trigger refuses updates. To change a plan's terms, insert its next version; new events get the highest version of their plan's code, and existing events keep the version they point at. A version that events use can't be deleted (foreign key, `RESTRICT`).
- **`Event.planId`** points at that version. **`Event.bonusStorageBytes`** is storage given to that one event on top of its plan (an add-on, a support grant), added to the plan's storage limit.
- **`EventPlanService`** runs every check and resolves an event's limits (`limitsOf`: its plan version's terms plus its bonus). Plan rows are cached by id, which is safe because they never change. Nothing else hard-codes 30, 3 GB or 30 days. The free plan's first version is seeded by migration `20261001210000_add_plan_catalog`.
- **Account limits** (2 active events) stay a constant, `ACCOUNT_PLAN_LIMITS`, until a host subscription exists; that can become its own catalog then. `EventPlanService.accountLimitsFor` and `accountUsageFor` answer for the account the way `limitsOf` and `usageFor` do for an event.
- **`Event.galleryOpensAt`** is the later of the event's date and the moment it was created (or, for an upcoming event, last rescheduled). **`Event.galleryClosesAt`** is that plus the length the host picked, `Event.galleryWindowDays`. Deactivating sets `galleryClosesAt` to now and records `deactivatedAt` and `deactivatedById`. **`Event.galleryClosedAt`** is set when the close job (`GalleryCloseService`, hourly, on with `GALLERY_CLOSE_ENABLED=true`) removes the photos. Responses carry `galleryState` (`UPCOMING`, `OPEN` or `CLOSED`), separate from the moderation `status`, the schedule, and `galleryWindowOptions`: the lengths the event's own plan version offers, for changing it while it is upcoming.

Adding Plus later means a new `EventPlan` enum value and a `Plan` row for its first version. An upgrade points the event at that version, and its gallery can then be made longer, up to the new plan's longest. An add-on only increases `bonusStorageBytes`.

## Costs

Photos are stored in S3.

- **Storage is cheap:** a full 3 GB gallery costs about $0.07 a month, and a full 50 GB Celebration about $1.15.
- **Downloads are the real cost:** $0.09/GB after 100 GB free per month. They grow with gallery size times the number of members:

| If every member downloads everything | Gallery | Members | Cost  |
| ------------------------------------ | ------- | ------- | ----- |
| Free                                 | 3 GB    | 30      | ~$8   |
| Plus                                 | 15 GB   | 100     | ~$135 |
| Celebration                          | 50 GB   | 200     | ~$900 |

Most members never download everything, so a realistic event costs much less. The paid plans still need guardrails before they ship:

1. browse with smaller images in the app (thumbnails and display sizes, designed in [photo-derivatives.md](./photo-derivatives.md)), with originals only on an explicit download;
2. "Download all" hands out each original once per member, not repeatedly;
3. put CloudFront in front of the bucket (1 TB free per month, cheaper per GB after).
