# Looking and saving (chapter 09)

The event screen composes the contact sheet, selection controls and viewer.
`useRollGallery` owns photo actions; `api/gallery.ts` owns paged reads,
renewing a photo's URL, deletion and cache invalidation. Viewer presentation
and original-loading state live in colocated component hooks.

The contact sheet fetches 60 photos at a time. Only scrolling near the end
requests another page. Select all and Save all deliberately enumerate the
whole visible collection; if a later page fails, they keep the previous
selection and show an error instead of silently acting on an incomplete roll.
Counts in the event header use the server's visible photo count.

Opening a photo requests its original. Swiping, the next/previous controls,
and the thumbnail strip move the same viewer; only its active frame renders
an original. The strip and grid use stable thumbnail cache keys. Attribution
comes from the participant list, with a fallback for a departed/deleted uploader.
A suspended/closed gallery or revoked access closes the viewer. An original
that fails or stalls exposes Retry, which renews its URL through the single
photo endpoint before reloading it.

Long-press starts selection in place: the cover, event details and contact
sheet keep their layout and scroll position while the top and bottom controls
switch to selection actions. The people link is inactive during selection.
Each newly selected photo gets a fresh handwritten pencil ring. A seed varies
the starting point, direction, lean, contour and overlap; it stays fixed while
that ring is mounted, so other selections and re-renders cannot redraw it.
The shared ring generator fits the entire stroke inside its bounds, including
wide text rings. Geometry tests exercise 10,000 variants across eight sizes.
Guests can delete only their own selected photos; hosts can delete any.
Under-review rolls cannot delete. Confirmation
names the number that will actually be removed for everyone. Each deletion
uses the existing endpoint, so the server still enforces ownership and
moderation rules. Successful and already-removed photos leave selection;
failed photos remain marked for retry. Optional batch deletion is EV-174.

Save all excludes the caller's own photos by default. Save requests add-only
Photos permission. A fresh single-photo read checks visibility and supplies a
current signed URL immediately before each download. Each operation owns a
unique temporary file with its original media extension. Photos receives that
file through `Asset.create`; success and failure both reclaim temporary files.
Progress counts attempted photos; result copy reports the successful count.
Retry saves only unsuccessful IDs, so it does not repeat successful writes.

Sharing uses `react-native-share` with local files, for both one photo and a
selection. It never shares signed storage URLs and does not require library
access. Temporary files remain until the system share sheet finishes. A
partial download failure opens no incomplete share sheet. Rebuild the native
app after installing this dependency; Expo Go cannot load it.

A synchronous operation lock covers permission prompts, preparation, saves,
shares and deletions. Leaving the screen, changing account or losing gallery
visibility cancels pending work before any subsequent library write or share.
Save/export progress is foreground session state, not a durable background
queue: keep the roll open. Durable download resumption and the proposed bulk
URL endpoint remain EV-74. Uploads retain their independent durable tray.

Chapter 10 report/block entry points and forms remain part of EV-133. They
are not rendered as inactive actions in this chapter. The latest design
reference is the chapter 09 flow in the linked Everglow design artifact.
