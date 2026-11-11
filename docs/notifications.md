# Notifications

How the API tells people things when they are not in the app. Push only for now, through the Expo Push Service.
Tracked in [EV-73](https://linear.app/mehrshadfb/issue/EV-73). The kinds of notification built on it are their
own issues: the gallery opening ([EV-141](https://linear.app/mehrshadfb/issue/EV-141)), the closing reminder
([EV-72](https://linear.app/mehrshadfb/issue/EV-72)), reports and removals
([EV-33](https://linear.app/mehrshadfb/issue/EV-33)), and per-type and per-event settings
([EV-142](https://linear.app/mehrshadfb/issue/EV-142)).

---

## 1. Rules

- **Push carries no user content.** No photo, no caption, no free text anyone typed. Copy is written per type in
  the API, in the film voice ([voice.md](./voice.md)). A reporter is never named.
- **A push token is a secret.** Whoever holds it can address the phone. It is never logged, never returned by the
  API, and travels in request bodies, not paths, so it stays out of access logs.
- **Nothing reaches an account once its deletion has started.**

## 2. Devices

The app registers the phone it runs on, and the API keeps one `UserDevice` row per Expo push token.

| Endpoint                             | When the app calls it                                                                      |
| ------------------------------------ | ------------------------------------------------------------------------------------------ |
| `PUT /users/me/devices`              | On every launch while signed in, and when the push token changes. Returns the device `id`. |
| `DELETE /users/me/devices/:deviceId` | On sign-out, before the access token is cleared.                                           |

- **Idempotent per token.** A phone that registers again only updates `lastSeenAt`, `platform` and `locale`.
- **A token moves between accounts.** If a phone signs in to another account, its row moves to that account, so
  the previous account's pushes stop reaching it. This also covers a sign-out whose `DELETE` never arrived
  (offline): the next sign-in on that phone takes the token over.
- **At most 10 phones per account.** Registering an eleventh drops the one seen least recently. One account's
  registrations take a transaction-scoped advisory lock on the account first, so concurrent registrations trim one
  after the other and the cap is exact.
- **Suspended accounts may register and unregister**, so account notices can still reach them.
- **Account deletion** removes the rows by cascade ([account-deletion.md](./account-deletion.md)).
- `locale` is the phone's BCP 47 tag. Copy is English for now; the tag is kept so translated copy needs no contract
  change.

## 3. Sending

A feature sends through `NotificationsService` (`api/src/notifications/notifications.service.ts`), never through
Expo directly:

```ts
await this.prisma.$transaction(async (tx) => {
  // ...the change the notification is about...
  await this.notifications.notify(
    tx,
    NotificationType.GALLERY_OPENED,
    memberIds,
    { eventId },
  );
});
this.notifications.kick();
```

- **In the caller's transaction.** `notify` writes one `Notification` row per recipient, so a notification exists
  exactly when the change it is about committed. `kick()` after the commit sends it at once; without it, the next
  minute's run does. Outside a transaction, `notifyNow` does both.
- **Once per occasion.** Each row has a unique `dedupeKey` built by the type
  (`gallery_closing:1d:<eventId>:<userId>`). Notifying again with the same key is a no-op, so a job that runs twice,
  or a retried request, does not notify twice.
- **Preferences.** `notify` asks `NotificationPreferencesService` which recipients want the type, except for types
  marked `required` (safety and account notices). It lets everyone through until
  [EV-142](https://linear.app/mehrshadfb/issue/EV-142) builds the settings.

### Types

Every type lives in `api/src/notifications/notification-catalogue.ts`: the ids its data carries and a type guard
that checks them, its copy per language, the app path a tap opens, its dedupe key, its Android channel, an optional
`ttlSeconds`, and whether it is `required`. Adding one:

1. Add the value to the `NotificationType` enum in `schema.prisma`, with a migration.
2. Add its data to `NotificationDataByType` and its entry to `NOTIFICATION_CATALOGUE`. The compiler refuses a type
   missing from either.
3. Write `isData` for its data. Rows outlive the code that wrote them: a row whose data no longer passes is
   `FAILED` with `invalid_data` and logged as `notification.render_failed`, never sent with broken copy.
4. Pick its channel (below). A new kind of notification gets a new channel id.
5. Set `ttlSeconds` if the notice is pointless late ("closes tomorrow"): Expo passes it on as `ttl`, so a phone
   that was off for days does not get it then. Leave it unset for notices that stay true (`TEST`, account notices).
6. Add a sample to `notification-catalogue.spec.ts`.
7. Write the copy to [voice.md](./voice.md): short, no exclamation marks, plain words for safety and deletion.
8. If the tap should open a screen that needs more than a path, handle it in the app's notification tap handler,
   which arrives with the app's side of EV-73.

| Type              | Sent when                                                                 | Opens                     | Required | Channel   | ttl    |
| ----------------- | ------------------------------------------------------------------------- | ------------------------- | -------- | --------- | ------ |
| `TEST`            | `pnpm run notifications:send-test` (§6). Never sent by the app.           | `/`                       | no       | `account` | none   |
| `REPORT_TO_CHECK` | New organizer-queue report (not platform-only). Batched per target. EV-33 | `/events/<id>/reports`    | no       | `reports` | 7 days |
| `PHOTO_HIDDEN`    | Photo open reports hit the hide threshold. EV-33                          | `/events/<id>/reports`    | no       | `reports` | 7 days |
| `PHOTO_REMOVED`   | `REMOVE_PHOTO` (or member removal that deletes the photo). EV-33          | `/events/<id>`            | yes      | `account` | none   |
| `MEMBER_REMOVED`  | `REMOVE_MEMBER` on a report. EV-33                                        | `/events/<id>`            | yes      | `account` | none   |

### Languages

`render(data, locale)` takes the language of the phone it is for. Each phone's `UserDevice.locale` (a BCP 47 tag)
picks a language in `NOTIFICATION_LOCALES` by its first part, and anything not listed gets English. The sender
renders once per language among the recipient's phones and sends each phone its own copy. Only English exists
today; translating means adding the language to `NOTIFICATION_LOCALES` and its copy to each entry.

### Android channels

Each kind of notification posts to its own Android channel (Expo's `channelId`), because Android fixes a
channel's importance once the phone has created it, and each kind gets its own switch in the phone's settings and
in the app's notification settings ("A roll opens", "New photos, in batches", "The day before it closes", "Someone
joins your roll", "Reports to check"). The ids are `NOTIFICATION_CHANNELS` in the catalogue, typed, so an entry
cannot name a channel that does not exist.

| Channel   | For                                                              |
| --------- | ---------------------------------------------------------------- |
| `account` | Account notices, `TEST`, and required removals                   |
| `reports` | Host report queue and hidden-photo notices (`REPORT_TO_CHECK`, `PHOTO_HIDDEN`) |

A new kind adds its channel id to `NOTIFICATION_CHANNELS` here **and** to the matching list the app creates its
channels from, in the same release. That list arrives with the app's side of EV-73
(`mobile/features/notifications/lib/push.ts`), which creates `account`. A push to a channel the phone never created
falls back to Expo's default channel.

## 4. The sender

`NotificationSenderService` sends the outbox through the [Expo Push API](https://docs.expo.dev/push-notifications/sending-notifications/).

- **Claims.** A run claims due `PENDING` rows with `FOR UPDATE SKIP LOCKED` and a 5-minute lease, so several API
  instances never send the same row. Every write that settles a row matches on its lease, in one transaction
  that runs the status update first: a pass that overran its lease (another pass claimed the row since) writes
  no deliveries, unregisters no phones and counts nothing (`leaseLost`, logged as `notification.lease_lost`).
- **Per row.** No phones, or the account's deletion has started: `SKIPPED`. Otherwise one message per phone, up to
  100 per Expo request. At least one phone accepted: `SENT`. Every phone refused: `FAILED`, with Expo's code.
  Each phone's answer is a `NotificationDelivery` row with its ticket.
- **One bad message.** Expo answers a request with a 400 when one message in it is invalid, failing all of them.
  The sender then splits that request in halves until the bad message is alone: it is `FAILED` with Expo's code,
  and the rest go out. A 429, a 5xx or no answer is not split: the whole request is retried.
- **Broken credentials.** `InvalidCredentials` or `MismatchSenderId`, at send or in a receipt, means the APNs key
  or FCM credentials in EAS no longer work, so every push on that platform fails. Each Expo request or receipt
  page that sees one logs a single `notification.credentials_invalid` error, which alarms
  ([alerting.md](../api/docs/alerting.md)).
- **Retries.** When Expo refuses or does not answer the whole request, its rows go back to `PENDING` with a backoff
  of 1 minute doubling up to an hour: 1, 2, 4, 8, 16, 32, then 60 minutes. After `NOTIFICATION_MAX_ATTEMPTS` (8)
  they are `FAILED` and logged as `notification.given_up` ([alerting.md](../api/docs/alerting.md)), so the last
  attempt comes about 2 hours after the first: an Expo outage, or a revoked access token fixed within that window,
  loses nothing. A 429 waits at least Expo's `Retry-After` (capped at an hour), and the run claims no more rows
  until then. A notification every phone refused with `MessageRateExceeded` (too many pushes to one phone too
  fast) is retried the same way instead of `FAILED`.
- **Receipts.** Every 15 minutes the receipts of tickets between 15 minutes and 24 hours old are checked:
  `DELIVERED` or `FAILED`. A phone Expo answers with `DeviceNotRegistered`, at send or in a receipt, is
  unregistered. A receipt that says `MessageRateExceeded` is marked `FAILED` and logged as
  `notification.receipt.rate_limited`, but not resent: the notification is already `SENT` and its other phones
  have it, and resending one phone's copy would need per-phone retries the outbox does not have. At our volume
  this should not happen; if the warning shows up regularly, that is the time to add them.
- **Once.** Each notification is sent once, except in one case: if the process dies after Expo accepted a request
  and before the result is written, the lease runs out and that request is sent again. Expo offers no idempotency
  key to close this.

| Job                    | When         | Enabled by                                     | Replicas               |
| ---------------------- | ------------ | ---------------------------------------------- | ---------------------- |
| Notification send      | every minute | on unless `NOTIFICATIONS_SENDER_ENABLED=false` | all; claims split work |
| Notification receipts  | every 15 min | on unless `NOTIFICATIONS_SENDER_ENABLED=false` | one at a time          |
| Notification retention | daily, 05:00 | always                                         | one at a time          |

Every replica schedules all three. Send runs everywhere, and the claims keep replicas off each other's rows.
Receipts and retention would repeat the same work on every replica (N replicas, N times the receipt calls to
Expo), so each run first takes a Postgres advisory lock with `pg_try_advisory_xact_lock` (`runExclusively` in
`api/src/prisma/advisory-lock.ts`); a replica that finds it held skips that run and logs its heartbeat with
`ranElsewhere: true`.

## 5. Retention

- Notifications, sent or not, and their deliveries: deleted after `NOTIFICATION_RETENTION_DAYS` (90).
- Phones that have not registered for `NOTIFICATION_DEVICE_STALE_DAYS` (270, FCM's staleness window): deleted.
- An account's notifications and phones go with it, by cascade.

## 6. Setup and testing

- **Expo.** Sending needs no key while the Expo project's "enhanced push security" is off. Once it is on, set
  `EXPO_ACCESS_TOKEN` in the deploy config. It is a secret: never in the repo.
- **Apple and Google.** A real push to a phone needs an EAS project id in the app config, a real bundle id, an APNs
  key uploaded to EAS, and an FCM project for Android. Expo Go cannot receive pushes on Android; use a development
  build.
- **End to end.** Sign in on a development build, accept the permission prompt, then from `api/`:

  ```bash
  pnpm run notifications:send-test -- <your username>
  ```

  It sends a `TEST` notification to every phone the account has registered and prints what Expo answered.

- **Against a real Postgres.** The unit and integration suites mock Prisma, so the claim, `SKIP LOCKED`, the lease
  match on `timestamp(3)`, the single-replica locks and the device cap under concurrency are tested by an opt-in
  suite, `api/test/db/notifications.db.spec.ts`: two senders on separate pools never claim the same row, a pass
  that died is recovered once its lease runs out, a pass that lost its lease writes nothing, receipts run on one
  instance, and concurrent registrations keep exactly 10 phones. From `api/`, against an empty migrated database
  (never a shared one; [testing.md](../api/docs/testing.md#database-suite)):

  ```bash
  DB_TEST_DATABASE_URL=postgresql://…/everglow_dbtest pnpm run test:db
  ```

  Without `DB_TEST_DATABASE_URL` it is skipped with a message. It is not in CI yet.

## 7. The app

The mobile side lives in `mobile/features/notifications/`.

- **Asking.** When someone joins a roll (06.6, "Want a note when photos land?"), and only while the system has not
  asked yet. Never at launch. The slip carries the arrival note ("You're on the roll · 25th") on its edge, and the
  roll hides its own strip meanwhile. Once the system has asked, the slip never shows again: the person decides in
  the system settings. "Not now" holds for 30 days, then a later join offers it again, because iOS shows no
  Notifications row in Settings until the app has asked. The "Not now" time is kept in the app's documents, not
  the Keychain, so a reinstall (which resets the permission) resets it too. The copy drops the drawing's "when
  people add a batch": no such notification is planned yet.
- **The Notes screen.** 14.9 ([EV-142](https://linear.app/mehrshadfb/issue/EV-142)) asks with
  `requestNotificationPermission()` (`lib/notification-permission.ts`). When the person allows it, the phone
  registers on its own.
- **Registering.** Each time an account is ready on the phone (launch, sign-in), when the push token changes, when
  the person allows notifications in the app, and on coming back to the app (notifications turned on in Settings),
  but only where notifications are allowed. A simulator, or an app without an EAS project id, has no token and
  registers nothing. The token listener passes its device token to `getExpoPushTokenAsync`: fetching the token
  again fires the listener again, so calling it bare from there loops. Registrations run one at a time, and a
  device token the API already accepted for the account is not sent again in the same session.
- **Signing out.** The app unregisters the phone before it clears the session (`lib/before-sign-out.ts`), giving
  up after 3 seconds. It first waits for a registration in flight, so a quick sign-out still removes it, and a
  registration that lands after the account left keeps no id. After deleting the account it skips this: the API
  removed the phones with the account. If the request never arrives, the phone keeps that account's pushes until
  someone signs in on it, which moves the token, or until Expo reports it gone. A failing handler never stops the
  Auth0 sign-out.
- **Tapping.** Opens the notification's `url` once an account is signed in and onboarded and the app is past the
  launch redirect, sign-in and onboarding, so the screen opens on top of Home. Only `/events/<id>`,
  `/events/<id>/envelope`, `/events/<id>/tray` and `/events/<id>/reports` open, without any query string or hash.
  A notification opens once, by its `notificationId`, whether it woke the app or reached it running. A tap the
  account had not opened yet is dropped when the account is cleared.
- **In the foreground.** A notification shows as a banner, without sound, and stays in the list. No banner while
  its roll is on screen.
- **Android.** One channel per kind of notification, matching the 14.9 toggles, created from
  `NOTIFICATION_CHANNELS` in `lib/push.ts`: `account` (account notices, `TEST`, required removals) and `reports`
  (host reports to check), at high importance. A type's catalogue `channel` must be one of these ids. Android fixes
  a channel's importance once the phone has created it, so changing one needs a new id. The old `default` channel
  is deleted. The small icon is tinted with the stamp colour (`app.json`). It has no `icon` of its own yet: the
  only monochrome asset, `assets/images/android-icon-monochrome.png`, is the Expo template's stand-in, so add one
  with the Everglow mark (96×96, white on transparent) when it exists.
