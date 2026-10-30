# Photo uploads

The chapter 08 tray is shared by the event page and the tray screen. Leaving
an event screen does not cancel its uploads. Photos keep their original
bytes, format and aspect ratio. The server protocol is
[Uploads](../../docs/uploads.md).

## Responsibilities

- `features/events/hooks/use-event-detail-screen.ts`: picker, exact file sizes,
  storage preflight and smallest-files-that-fit prompt.
- `features/events/api/upload-event-photos.ts`: batches of 20, four concurrent
  file PUTs, mint conflicts/rate limits, confirmation and reconciliation.
- `features/events/lib/upload-tray.ts`: one queue per event, subscriptions,
  bounded connection retries, cancellation and account ownership.
- `features/events/lib/upload-tray-view.ts`: pure progress, numbering and
  presentation selectors, independent of network and persistence.
- `features/events/lib/upload-tray-storage.ts`: private retained files and
  validated versioned snapshots; keep the preceding snapshot if a write is
  interrupted. Byte progress does not rewrite snapshots.
- `features/events/providers/upload-tray-provider.tsx`: authenticated-account
  restoration independent of any event screen. Auth clears the queue through
  the shared account-cleared registry, without importing feature code.

## App lifecycle

A picked file is copied from the picker cache into
`Paths.document/upload-trays/<account>/` before sending. The queue records
reservation IDs before starting PUTs; it never persists signed URLs or
credentials. Disk-copy failure prevents enqueueing and shows an error.

`UploadTask` uses a file and explicitly selects the iOS `background` session.
The OS can continue native transfers while the app is backgrounded. Native
transfer scheduling remains under OS control; later JavaScript phases such
as another batch and confirmation can wait for the app to resume.

After process termination, restore unfinished jobs as **Interrupted** with
failure marks and Retry on the event page. Do not silently declare success or
immediately restart restored jobs. Before retrying an existing reservation,
confirm its ID: READY completes it without another PUT or mint; MISSING,
MISMATCHED or NOT_FOUND permits a new reservation. A missing confirmation
response remains recoverable and never authorizes another mint. Photos
already in a fresh server list clear stale local failures.

Apple cancels background transfers after a user force-quits and does not
relaunch the app for them. Resume recovery after the user opens the app.
The simulator pass checks backgrounding and process termination; it does not
prove physical-device scheduling under memory pressure, long suspension or
Android battery restrictions.

References: [Apple background sessions](<https://developer.apple.com/documentation/foundation/urlsessionconfiguration/background(withidentifier:)>),
[Apple background transfers](https://developer.apple.com/documentation/foundation/downloading-files-in-the-background),
[Android persistent work](https://developer.android.com/develop/background-work/background-tasks/persistent).
These are platform references, not claims about another app's internals.

## Failures and cancellation

- Connection failures stay on the sheet with Retry. While online, retry after
  1, 3 and 10 seconds, then leave the failure visible. Reconnection retries
  connection failures. Refused files and interrupted jobs require manual Retry.
- A 429 honors Retry-After up to three waits per batch; Cancel interrupts the
  timer. A reservation conflict retries once. Confirm retries its same IDs once.
- Closed and full galleries have distinct outcomes; never retry a closed roll.
  Rejected videos/oversize files and unavailable local files can be removed.
- Cancel stops native PUTs, drops waiting files and removes pending connection
  retries so reconnecting cannot restart cancelled work. Landed files can still be
  confirmed. Pending reservations not confirmed rely on the API cleanup window
  described in the shared protocol; a lost mint response has the same limit.
- Sign-out aborts upload and API work, removes private local queue storage and
  rejects callbacks from the previous run. The next account cannot inherit it.
- A failed gallery refresh retains confirmed local frames. A displayed remote
  thumbnail releases its local copy; cancellation/removal also releases copies.
  Restoration reclaims unreferenced files. Closed/suspended/upcoming galleries
  expose neither remote nor local photo previews in the tray.

## Verification

Unit tests cover batching, cancellation, reconciliation without duplicate
mints, bounded retries, interrupted/corrupt snapshots and account isolation.
Screen integration tests cover chapter 08 outcomes, recovery controls and
hidden-gallery privacy. Native verification uses disposable synthetic files
and a local QA event, then removes the event and its objects. A temporary QA
route is used only during native checks and is removed before committing.
