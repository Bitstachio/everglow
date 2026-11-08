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
- **At most 10 phones per account.** Registering an eleventh drops the one seen least recently. One account's
  registrations take a transaction-scoped advisory lock on the account first, so concurrent registrations trim one
  after the other and the cap is exact.
- **Suspended accounts may register and unregister**, so account notices can still reach them.
- **Account deletion** removes the rows by cascade ([account-deletion.md](./account-deletion.md)).
- `locale` is the phone's BCP 47 tag. Copy is English for now; the tag is kept so translated copy needs no contract
  change.
