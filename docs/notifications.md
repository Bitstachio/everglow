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

| Endpoint                              | When the app calls it                                                                      |
| ------------------------------------- | ------------------------------------------------------------------------------------------ |
| `PUT /users/me/devices`               | On every launch while signed in, and when the push token changes. Returns the device `id`. |
| `DELETE /users/me/devices/:deviceId`  | On sign-out, before the access token is cleared.                                           |

- **Idempotent per token.** A phone that registers again only updates `lastSeenAt`, `platform` and `locale`.
- **A token moves between accounts.** If a phone signs in to another account, its row moves to that account, so
  the previous account's pushes stop reaching it. This also covers a sign-out whose `DELETE` never arrived
  (offline): the next sign-in on that phone takes the token over.
- **At most 10 phones per account.** Registering an eleventh drops the one seen least recently.
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
  await this.notifications.notify(tx, NotificationType.GALLERY_OPENED, memberIds, { eventId });
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

Every type lives in `api/src/notifications/notification-catalogue.ts`: the ids its data carries, its copy, the
app path a tap opens, its dedupe key, and whether it is `required`. Adding one:

1. Add the value to the `NotificationType` enum in `schema.prisma`, with a migration.
2. Add its data to `NotificationDataByType` and its entry to `NOTIFICATION_CATALOGUE`. The compiler refuses a type
   missing from either.
3. Add a sample to `notification-catalogue.spec.ts`.
4. Write the copy to [voice.md](./voice.md): short, no exclamation marks, plain words for safety and deletion.
5. If the tap should open a screen that needs more than a path, handle it in the app's notification response
   handler (`mobile/features/notifications/`).

| Type   | Sent when                                                       | Opens | Required |
| ------ | --------------------------------------------------------------- | ----- | -------- |
| `TEST` | `pnpm run notifications:send-test` (§6). Never sent by the app. | `/`   | no       |

## 4. The sender

`NotificationSenderService` sends the outbox through the [Expo Push API](https://docs.expo.dev/push-notifications/sending-notifications/).

- **Claims.** A run claims due `PENDING` rows with `FOR UPDATE SKIP LOCKED` and a 5-minute lease, so several API
  instances never send the same row. Every write that settles a row matches on its lease.
- **Per row.** No phones, or the account's deletion has started: `SKIPPED`. Otherwise one message per phone, up to
  100 per Expo request. At least one phone accepted: `SENT`. Every phone refused: `FAILED`, with Expo's code.
  Each phone's answer is a `NotificationDelivery` row with its ticket.
- **Retries.** When Expo refuses or does not answer the whole request, its rows go back to `PENDING` with a backoff
  of 30 s doubling up to an hour. After `NOTIFICATION_MAX_ATTEMPTS` (5) they are `FAILED` and logged as
  `notification.given_up` ([alerting.md](../api/docs/alerting.md)).
- **Receipts.** Every 15 minutes the receipts of tickets between 15 minutes and 24 hours old are checked:
  `DELIVERED` or `FAILED`. A phone Expo answers with `DeviceNotRegistered`, at send or in a receipt, is
  unregistered.
- **Once.** Each notification is sent once, except in one case: if the process dies after Expo accepted a request
  and before the result is written, the lease runs out and that request is sent again. Expo offers no idempotency
  key to close this.

| Job                    | When           | Enabled by                                     |
| ---------------------- | -------------- | ---------------------------------------------- |
| Notification send      | every minute   | on unless `NOTIFICATIONS_SENDER_ENABLED=false` |
| Notification receipts  | every 15 min   | on unless `NOTIFICATIONS_SENDER_ENABLED=false` |
| Notification retention | daily, 05:00   | always                                         |

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
