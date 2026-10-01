# Free and paid plans

The business model Everglow is going forward with. The **free plan is decided**. The **paid plans are proposed**: they come later, and their prices will be set from real usage.

It replaces the personal 5 GB storage limit ([photos-architecture.md](./photos-architecture.md) §9) with limits per event. Implementation is [EV-64](https://linear.app/mehrshadfb/issue/EV-64); this doc is [EV-67](https://linear.app/mehrshadfb/issue/EV-67).

## Principles

- **The host pays, guests never do.** Joining an event is always free, whatever the plan.
- **Limits follow the event, not the person.** Each event has a plan, and upgrading one event doesn't change the others.
- **Galleries close.** After the window, the photos are removed and the event itself stays (title, members, cover). Members download before that.

## Free (decided)

| Limit                      | Free                         |
| -------------------------- | ---------------------------- |
| Active events at once      | 2                            |
| Members per event          | 30                           |
| Photos per event           | 500                          |
| Upload and download window | 30 days after the event date |

- **Active** means the gallery is still open. Only events you created count; events you joined don't. When one closes or you delete it, you can start another. There's no weekly allowance, so a busy weekend is fine as long as no more than 2 are open at once.
- **Photos** is what users see. Behind it, the existing 25 MB per-file limit stays, plus a hidden 3 GB per-event safety cap that no normal event reaches.
- **The window** ends 30 days after the event's date. After that, uploads stop and the photos are removed. The event stays, doesn't count toward the 2 anymore, and can't be reopened.

## Paid (proposed, later)

**First: a one-time upgrade for a single event.** It's an in-app purchase by the host, and Apple takes 15% under the Small Business Program.

|         | Free    | **Plus**                     | **Celebration**                                |
| ------- | ------- | ---------------------------- | ---------------------------------------------- |
| Price   | $0      | ~$5–10 per event             | ~$30–50 per event                              |
| Members | 30      | 100                          | Unlimited                                      |
| Photos  | 500     | 2,000                        | Unlimited                                      |
| Window  | 30 days | 90 days                      | 1 year, then an optional yearly "keep forever" |
| Extras  | –       | Full-resolution zip download | Everything in Plus, live slideshow, co-hosts   |
| For     | Friends | Bigger parties               | Weddings                                       |

**Later: a subscription** (~$4/month or ~$30/year) for people who host often: more active events at once, and every event at Plus level. We add it only once the data shows people buying Plus several times a year.

Why per event first: the whole category charges this way (POV, Kululu, GuestPix, GuestCam charge $5–$99 per event), because most people have a big event only a few times a year and a monthly fee feels wrong to them.

## What the first build includes

1. **Limits stored per event, as its plan**, not as constants in code. A paid tier then means a different plan on the event, and the numbers can change without a release.
2. **A warning before the gallery closes**, 7 days and 1 day before, with "download all".
3. **Usage tracking:** photos, members and downloads per event. These set the paid prices.
4. **Reported photos are kept when a gallery closes**, for the retention window in [EV-61](https://linear.app/mehrshadfb/issue/EV-61), so closing a gallery never destroys evidence.

## Costs

Photos are stored in S3.

- **Storage is cheap:** a full 3 GB gallery costs about $0.07 a month.
- **Downloads are the real cost:** $0.09/GB after 100 GB free per month. A full gallery downloaded by 20 members is about $5.

That's why the free plan limits members and photos rather than GB. When usage grows:

1. show smaller images in the app, with full resolution only on an explicit download;
2. put CloudFront in front of the bucket (1 TB free per month).
