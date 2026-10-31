# Looking and saving (chapter 09)

The event screen composes the contact sheet, selection controls and viewer.
`useRollGallery` owns photo actions. `api/gallery.ts` owns the paged contact
sheet and the bulk read; `api/save-event-photos.ts` owns downloads, saving to
Photos and the files handed to the share sheet; `useRenewEventPhoto` and
`useDeleteEventPhotoMutation` renew one frame's links and delete a frame.
Viewer presentation and original-loading state live in colocated component
hooks under `components/frame-viewer/`.

The contact sheet fetches 60 photos at a time. Only scrolling near the end
requests another page. Select all and Save all deliberately enumerate the
whole visible collection; if a later page fails, they keep the previous
selection and show an error instead of silently acting on an incomplete roll.
Counts in the event header use the server's visible photo count. Each page
records when its links were signed, so a download knows how old they are.

Opening a photo requests its original. Swiping, the thumbnail strip, and the header’s screen-reader adjustment
actions move the same viewer; only its active frame renders
an original. The strip and grid use stable thumbnail cache keys. Attribution
comes from the participant list, with a fallback for a departed/deleted uploader.
The original viewport uses native horizontal paging: photos track the finger,
with cached thumbnail previews on adjacent pages. Selection and attribution
change only after the page settles. The selected page keeps its thumbnail as
a placeholder while its original loads; dragging back loads no other original.
A suspended/closed gallery or revoked access closes the viewer. Leaving the
roll keeps its frames on screen until Home replaces it; only actions stop. An
original that fails or stalls exposes Retry, which renews its URL through the
single photo endpoint and writes it into the contact sheet's cache before
reloading it.

Long-press, or the frame's Mark accessibility action, starts selection in place: the cover, event details and contact
sheet keep their layout and scroll position while the top and bottom controls
switch to selection actions. The people link is inactive during selection.
Each photo gets its own handwritten pencil ring, seeded from its id: the seed
varies the starting point, direction, lean, contour and overlap, and the same
photo draws the same ring each time it's marked or scrolled back into view.
The shared ring generator fits the entire stroke inside its bounds, including
wide text rings. Geometry tests exercise 10,000 variants across eight sizes.
Guests can delete only their own selected photos; hosts can delete any.
Under-review rolls cannot delete. Confirmation
names the number that will actually be removed for everyone. Each deletion
uses the existing endpoint, so the server still enforces ownership and
moderation rules. Successful and already-removed photos leave selection;
failed photos remain marked for retry. Optional batch deletion is EV-174.

Save all excludes the caller's own photos by default. Save requests add-only
Photos permission. Downloads use the listed link while it is under 10 minutes
old (links live 15), renew it through the single-photo endpoint when it is
older, and try once more with a renewed link when a fresh-looking one is
refused; there is no extra read per photo. Each download owns a unique
temporary file with its original media extension. Photos receives that file
through `Asset.create`; success and failure both reclaim temporary files.
Progress counts attempted photos and can be stopped; result copy reports the
successful count. A save of several frames remembers what it saved: "Retry N
unsaved", or Save all again, saves only the rest, and the row can be
dismissed. Saving one frame from the viewer takes it off that list but never
clears the rest. A frame that answers 404 was deleted: it leaves the list and
the contact sheet instead of failing on every retry.

Sharing uses `react-native-share` with local files, for both one photo and a
selection. It never shares signed storage URLs and does not require library
access. Android's receiving app can read the files after `Share.open`
resolves, so they stay in the cache until the next share starts. Progress
shows done/total and can be stopped; a stopped or partly failed download
opens no incomplete share sheet and removes its files at once. Rebuild the
native app after installing this dependency; Expo Go cannot load it. It needs
no config plugin: autolinking adds the native module and its Android file
provider, and the plugin only adds app-specific URL schemes and queries.

A synchronous operation lock covers permission prompts, preparation, saves,
shares and deletions. Leaving the screen, changing account or losing gallery
visibility cancels pending work before any subsequent library write or share.
Save/export progress is foreground session state, not a durable background
queue: keep the roll open. Durable download resumption and the proposed bulk
URL endpoint remain EV-74. Uploads retain their independent durable tray.

Chapter 10 report/block entry points and forms remain part of EV-133. They
are not rendered as inactive actions in this chapter. The latest design
reference is the chapter 09 flow in the linked Everglow design artifact.

The chapter 09 viewer uses a compact mono name and 24-hour timestamp without an
avatar, a five-frame contact strip with sprockets contained around it, and
Save / Share / More text actions. The strip is not the shared `FilmStrip`:
that one is a fixed, decorative row, while this one scrolls the whole roll and
each frame is a control. Landscape originals stay uncropped with
letterboxing. The frame menu uses a thumbnail summary and trailing action
icons; its delete label distinguishes the caller’s own frame from a host
removing somebody else’s. Visible frame numbers remain omitted.

An original-image failure automatically renews its signed URL once while the
loading indicator and thumbnail stay visible. Cached gallery URLs can expire
before a photo is opened even when its thumbnail is still cached. A second
failure, failed renewal, or 30 seconds without a byte arriving offers explicit
retry; each progress event restarts that timer, so a slow download carries on.
Navigation resets the retry budget for the next photo. Original cache keys
stay stable across renewal.

On iOS, ordinary viewer dismissal keeps the selected photo, attribution and
filmstrip intact until the native fade finishes. Revoked access still clears
the viewer immediately. Changing photos or closing the viewer clears its menu
and any deferred menu action, so the next photo starts with fresh controls.
