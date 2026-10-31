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

Opening a photo requests its original. Swiping, the thumbnail strip, and the header’s screen-reader adjustment
actions move the same viewer. The strip and grid use stable thumbnail cache
keys. Attribution comes from the participant list, with a fallback for a
departed/deleted uploader.

The viewer's pager (`frame-viewer/use-frame-pager.ts`) runs on the UI thread
with Gesture Handler and Reanimated. Frames sit on one strip with a 16pt gap;
the current frame follows the finger 1:1 and neighbours slide in from the
edges. Release settles with a spring: a flick moves one frame even after a
short drag, a slow drag moves on past halfway, and the first and last frames
rubber-band. The current index is derived from the strip's offset, so
attribution and the film strip change as the swipe passes halfway. A strip
tap or a screen-reader step glides there from the adjacent frame. The geometry
(snap target, rubber band, window, zoom limits) is pure and unit-tested in
`frame-viewer/paging.ts`.

Only the current frame and two on each side are mounted, so a 1,000-frame roll
renders five pages. The current frame and one on each side load originals;
the outer two show thumbnails. Every page keeps its thumbnail mounted under
the original, which fades in over it, so a frame is never blank while its
original loads or reloads. `expo-image` prefetching keys its cache by URL and
our signed URLs change on every read, so neighbours preload by mounting with
the stable cache keys instead. A page keeps the URLs it started loading with;
a gallery refetch (for example, after the Photos permission prompt) does not
reload an open original. Only a renewal replaces the URL.

Pinch and double tap zoom the current frame; paging is off until it is back
at 1×. Dragging the photo down shrinks it and fades the chrome, then closes
the viewer through the normal close path; a short drag springs back. Reduce
Motion uses a stiff spring with no overshoot and shorter fades. Save progress,
results and the retry button sit over the bottom of the photo rather than
resizing it.

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

The chapter 09 viewer uses a compact mono name and timestamp without an avatar,
a five-frame contact strip with sprockets contained around it, and
Save / Share / More text actions. Landscape originals stay uncropped with
letterboxing. The frame menu uses a thumbnail summary and trailing action
icons; its delete label distinguishes the caller’s own frame from a host
removing somebody else’s. Visible frame numbers remain omitted.

An original-image failure automatically renews its signed URL once while the
loading indicator stays visible. Cached gallery URLs can expire before a photo
is opened even when its thumbnail is still cached. A second failure, failed
renewal, or 30-second image stall offers explicit retry; navigation resets the
retry budget for the next photo. Original cache keys stay stable across renewal.

On iOS, ordinary viewer dismissal keeps the selected photo, attribution and
filmstrip intact until the native fade finishes. Revoked access still clears
the viewer immediately. Changing photos or closing the viewer clears its menu
and any deferred menu action, so the next photo starts with fresh controls.
