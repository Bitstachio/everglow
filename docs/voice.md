# Voice and words

How Everglow talks. The app is drawn as a contact sheet: every event is a roll of film, and the copy uses the same words. This is the reference for mobile copy (screens, error messages in `mobile/locales/`) and, later, push notifications. The design is in [EV-133](https://linear.app/mehrshadfb/issue/EV-133); this doc is [EV-143](https://linear.app/mehrshadfb/issue/EV-143).

## Words

| In the code and API          | In the app                      | Example                                           |
| ---------------------------- | ------------------------------- | ------------------------------------------------- |
| event                        | roll, or its name               | "Sam & Jo's wedding", "Start a roll"              |
| photo on the event           | frame                           | "148 frames", "Delete 2 frames?"                  |
| photo in the phone's library | photo                           | "Add photos", "Saved to Photos"                   |
| gallery open / closed        | the roll is open / closed       | "This roll has closed."                           |
| gallery length               | film: a 3, 7, 14 or 30-day roll | "Choose film"                                     |
| organizer                    | host                            | "Only hosts can do that."                         |
| participant                  | adds photos                     | "Join and add photos"                             |
| viewer                       | view only                       | "Join to look"                                    |
| member, members              | on the roll                     | "You're already on this roll."                    |
| invite link, QR code         | envelope                        | "Reset this envelope?"                            |
| deactivate                   | cut the roll                    | "Cut the roll, or wait for it to close."          |
| uploading                    | developing                      | "2 of 5 developed"                                |
| upload failed                | didn't take                     | "Didn't take. Retry."                             |
| storage                      | room, with the real numbers     | "Only room for 3 of 5. 0.1 GB left."              |
| profile                      | lab card                        | "Finish setting up your lab card"                 |
| under review                 | on hold                         | "This roll is on hold while Everglow reviews it." |

## Plain words win when it matters

Film words are for the everyday. Use plain words, with no metaphor, for:

- **Safety and the law:** reporting, blocking, suspension, child safety. "Report", "block", "suspended for breaking our terms".
- **Deletion:** say exactly what goes and for whom. "They're removed for everyone. This can't be undone."
- **Accounts and sign-in:** username, email, password, delete account.

If a film word could leave someone unsure what will happen, use the plain one.

## Tone

- Short and a little dry, the way a photo lab writes a note: "Pick up by 17 Nov, then it's gone."
- Say what happened, then what to do: "A host removed you from this roll. Only a host can let you back in."
- Real numbers as they are: "1.2 GB of 3 GB". Never turn storage into a number of photos.
- Never imply photos survive a closed roll.
- Don't hard-code plan limits in copy ("2 rolls", "30 people"). Read them from the API, or leave the number out, so paid plans don't need new strings.
- No exclamation marks and no emoji.

## Less on the page

Screens stay light. Before adding a line, check what the screen already says.

- One short label per section ("Film"), not a label plus an explanation.
- Don't say the same thing twice: if the boxes say "A week · 7 day roll", the heading doesn't need "how long people can add photos".
- Prefer showing over labelling: the cover is a print pinned to the roll's label, not a section with a heading.
- No hints for what people will see for themselves ("Shows on Home, the envelope and the top of the roll").
- Keep the one fact people need to decide: "Photos removed Sat 14.11".
- The drawings can be wordier than this; cut to this rule and note the difference in the PR.
