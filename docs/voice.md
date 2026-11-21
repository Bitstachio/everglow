# Voice and words

How Everglow talks. Every event is a set of photos shared on one night, and the copy uses plain words for them: event, photo, duration. This is the reference for mobile copy (screens, error messages in `mobile/locales/`) and, later, push notifications. The design is in [EV-133](https://linear.app/mehrshadfb/issue/EV-133); this doc is [EV-143](https://linear.app/mehrshadfb/issue/EV-143). The film terms (roll, frame, film) were replaced in [EV-253](https://linear.app/mehrshadfb/issue/EV-253) because they read as video to new people.

## Words

| In the code and API          | In the app                           | Example                                            |
| ---------------------------- | ------------------------------------ | -------------------------------------------------- |
| event                        | event, or its name                   | "Sam & Jo's wedding", "Start an event"             |
| photo on the event           | photo                                | "148 photos", "Delete 2 photos?"                   |
| photo in the phone's library | photo                                | "Add photos", "Saved to Photos"                    |
| gallery open / closed        | the event is open / closed           | "This event has closed."                           |
| gallery length               | duration: a 3, 7, 14 or 30-day event | "Duration", "7 days"                               |
| organizer                    | host                                 | "Only hosts can do that."                          |
| participant                  | adds photos                          | "Join and add photos"                              |
| viewer                       | view only                            | "Join to look"                                     |
| member, members              | in the event                         | "You're already in this event."                    |
| invite link, QR code         | envelope                             | "Reset this envelope?"                             |
| deactivate                   | end the event early                  | "End the event now, or wait for it to close."      |
| uploading                    | developing                           | "Developing 2 of 5"                                |
| upload failed                | didn't take                          | "Didn't take. Try again."                          |
| storage                      | room, with the real numbers          | "Only room for 3 of 5. 0.1 GB left."               |
| profile                      | lab card                             | "Finish setting up your lab card"                  |
| under review                 | on hold                              | "This event is on hold while Everglow reviews it." |

Envelope, developing, didn't take and lab card are still lab words. They are kept for now; a later change can replace them with the same plain-word test used below.

## Plain words win when it matters

Use plain words, with no metaphor, for:

- **Safety and the law:** reporting, blocking, suspension, child safety. "Report", "block", "suspended for breaking our terms".
- **Deletion:** say exactly what goes and for whom. "They're removed for everyone. This can't be undone."
- **Accounts and sign-in:** username, email, password, delete account.

If a word could leave someone unsure what will happen, use the plain one.

## Tone

- Short and a little dry, the way a photo lab writes a note: "Pick up by 17 Nov, then it's gone."
- Say what happened, then what to do: "A host removed you from this event. Only a host can let you back in."
- Real numbers as they are: "1.2 GB of 3 GB". Never turn storage into a number of photos.
- Never imply photos survive a closed event.
- Don't hard-code plan limits in copy ("2 events", "30 people"). Read them from the API, or leave the number out, so paid plans don't need new strings.
- No exclamation marks and no emoji.

## Less on the page

Screens stay light. Before adding a line, check what the screen already says.

- One short label per section ("Duration"), not a label plus an explanation.
- Don't say the same thing twice: if the boxes say "A week · 7 days", the heading doesn't need "how long people can add photos".
- Prefer showing over labelling: the cover is a print pinned to the event's label, not a section with a heading.
- No hints for what people will see for themselves ("Shows on Home, the envelope and the top of the event").
- Keep the one fact people need to decide: "Photos removed Sat 14.11".
- The drawings can be wordier than this; cut to this rule and note the difference in the PR.

## Push notifications

Copy lives in `api/src/notifications/notification-catalogue.ts`. Same tone as the rest of this doc: short, dry, no
exclamation marks, no event title or other text a person typed (the push carries ids only; the tap opens the roll).

| Type             | Title (en)     | Body (en)              |
| ---------------- | -------------- | ---------------------- |
| `GALLERY_OPENED` | A roll is open | Take the first shot.   |
