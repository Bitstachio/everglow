# Free and paid plans

The business model Everglow is going forward with. The **free plan is decided**. The **paid plans are proposed**: they come later, and their prices will be set from real usage.

It replaces the personal 5 GB storage limit with limits per event; [photos-architecture.md](./photos-architecture.md) §9 covers how gallery storage is enforced. Implementation is [EV-64](https://linear.app/mehrshadfb/issue/EV-64); this doc is [EV-67](https://linear.app/mehrshadfb/issue/EV-67).

## Principles

- **The host pays, guests never do.** Joining an event is always free, whatever the plan.
- **Limits follow the event, not the person.** Each event has a plan, and upgrading one event doesn't change the others.
- **Galleries close.** After the window, the photos are removed and the event itself stays (title, members, cover). Members download before that.

## Free (decided)

| Limit                      | Free                         |
| -------------------------- | ---------------------------- |
| Active events at once      | 2                            |
| Members per event          | 30                           |
| Gallery storage per event  | 3 GB                         |
| Upload and download window | 30 days after the event date |

- **Active** means the gallery is still open. Only events you created count; events you joined don't. When one closes or you delete it, you can start another. There's no weekly allowance, so a busy weekend is fine as long as no more than 2 are open at once.
- **Gallery storage** is the one limit on what a gallery holds: everything uploaded to the event, by everyone, counts toward its 3 GB. There's no limit on the number of photos. The app shows storage as it is, "1.2 GB of 3 GB", and never turns it into an estimated number of photos.
- Photos upload as they are. Whether to compress some of them before upload is undecided ([EV-94](https://linear.app/mehrshadfb/issue/EV-94)).
- **The window** ends 30 days after the event's date. After that, uploads stop and the photos are removed, by an hourly job ([photos-architecture.md](./photos-architecture.md) §12). A photo with an open report is kept, hidden, until the report is resolved. The event stays, doesn't count toward the 2 anymore, and can't be reopened.
- **A closed event** stays in its members' lists, marked closed, with its details and members. Members can remove it from their list (leaving it), and organizers can delete it for everyone. What it no longer allows:
  - **seeing photos**: from the close time on, its photos aren't listed or opened for anyone, organizers included, even before the close job removes them;
  - **joining**: the invite links stop working (`EVENT_GALLERY_CLOSED`), and event responses list no invites;
  - **new invite links**: regenerating one is refused;
  - **a new date**: it would imply reopening the gallery. The title, description and cover can still change;
  - **deleting photos on leave**: `?photos=DELETE` is ignored, so photos kept as evidence (open reports) can't be removed by a member.
- **Members** counts every role, organizers included.

### When a limit is reached

The API refuses with a 403 and a `code`, and the error carries nothing else. The app takes the numbers for its copy from two places, which share one shape: a `plan`, its `limits` (null for no limit), and the `usage` counted the same way.

- **An event** carries its own: `limits.members` and `limits.storageBytes`, with `usage` for both (storage in bytes, as a decimal string).
- **`GET /users/me/limits`** has the account's: `limits.activeEvents` and `usage.activeEvents`, plus `nextClosingEvent` (`id`, `title`, `galleryClosesAt`), the active event whose gallery closes first and frees a place, or null.

| Code                          | When                                                                                  |
| ----------------------------- | ------------------------------------------------------------------------------------- |
| `ACTIVE_EVENT_LIMIT_REACHED`  | Creating a 3rd event while 2 you created are still open                               |
| `EVENT_MEMBER_LIMIT_REACHED`  | Joining an event that has 30 members, through any role's invite                       |
| `EVENT_STORAGE_LIMIT_REACHED` | An upload batch that would take the gallery past its 3 GB (uploads in progress count) |
| `EVENT_GALLERY_CLOSED`        | Uploading to a gallery whose close time has passed                                    |

Concurrent requests can't slip past a limit. Creates by the same person, and joins to the same event, take a Postgres advisory lock for their count and insert. Upload batches share the reservation's Serializable transaction.

## Paid (proposed, later)

**First: a one-time upgrade for a single event.** It's an in-app purchase by the host, and Apple takes 15% under the Small Business Program.

|                 | Free    | **Plus**              | **Celebration**                                |
| --------------- | ------- | --------------------- | ---------------------------------------------- |
| Price           | $0      | ~$5–10 per event      | ~$30–50 per event                              |
| Gallery storage | 3 GB    | 15 GB                 | 50 GB                                          |
| Members         | 30      | 100                   | Unlimited (fair use)                           |
| Window          | 30 days | 90 days               | 1 year, then an optional yearly "keep forever" |
| Videos          | –       | Up to 1 minute each   | Up to 3 minutes each                           |
| Extras          | –       | Download all as a zip | Everything in Plus, live slideshow, co-hosts   |
| For             | Friends | Bigger parties        | Weddings                                       |

Storage is the limit on every plan, so videos simply take more of it. Each tier is about five times the one below.

**Later: a subscription** (~$4/month or ~$30/year) for people who host often: more active events at once, and every event at Plus level. We add it only once the data shows people buying Plus several times a year.

Why per event first: the whole category charges this way (POV, Kululu, GuestPix, GuestCam charge $5–$99 per event), because most people have a big event only a few times a year and a monthly fee feels wrong to them.

## What the first build includes

1. **Limits stored per event, as its plan**, not as constants in code. A paid tier then means a different plan on the event, and the numbers can change without a release.
2. **A warning before the gallery closes**, 7 days and 1 day before, with "download all".
3. **Usage tracking:** storage used, members and downloads per event. These set the paid prices.
4. **Reported photos are kept when a gallery closes**, for the retention window in [EV-61](https://linear.app/mehrshadfb/issue/EV-61), so closing a gallery never destroys evidence.

## How it's built

**Plans are a versioned catalog in the database.** Each event points at the plan version it was created on, so a paid plan, or a change to a plan, is a data change, not a refactor, and never changes events already created or sold.

- **`Plan`** rows hold a plan's terms: `code` (`FREE` today; Plus and Celebration later) and `version`, plus one column per kind of limit: `memberLimit`, `storageLimitBytes`, `galleryWindowDays`. Null means no limit. A new kind of limit (videos allowed, longest video, …) is a new column here, never on `Event`.
- **Plan rows never change.** A database trigger refuses updates. To change a plan's terms, insert its next version; new events get the highest version of their plan's code, and existing events keep the version they point at. A version that events use can't be deleted (foreign key, `RESTRICT`).
- **`Event.planId`** points at that version. **`Event.bonusStorageBytes`** is storage given to that one event on top of its plan (an add-on, a support grant), added to the plan's storage limit.
- **`EventPlanService`** runs every check and resolves an event's limits (`limitsOf`: its plan version's terms plus its bonus). Plan rows are cached by id, which is safe because they never change. Nothing else hard-codes 30, 3 GB or 30 days. The free plan's first version is seeded by migration `20261001210000_add_plan_catalog`.
- **Account limits** (2 active events) stay a constant, `ACCOUNT_PLAN_LIMITS`, until a host subscription exists; that can become its own catalog then. `EventPlanService.accountLimitsFor` and `accountUsageFor` answer for the account the way `limitsOf` and `usageFor` do for an event.
- **`Event.galleryClosesAt`** is the event's date plus its plan version's window, moved with the date until the gallery closes. **`Event.galleryClosedAt`** is set when the close job (`GalleryCloseService`, hourly, on with `GALLERY_CLOSE_ENABLED=true`) removes the photos. Responses carry `galleryState` (`OPEN` or `CLOSED`), separate from the moderation `status`.

Adding Plus later means a new `EventPlan` enum value and a `Plan` row for its first version. An upgrade points the event at that version and recomputes `galleryClosesAt`. An add-on only increases `bonusStorageBytes`.

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

1. browse with smaller images in the app (thumbnails and display sizes), with originals only on an explicit download;
2. "Download all" hands out each original once per member, not repeatedly;
3. put CloudFront in front of the bucket (1 TB free per month, cheaper per GB after).
