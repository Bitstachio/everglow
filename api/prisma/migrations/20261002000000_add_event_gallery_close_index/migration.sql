-- The gallery close job's hourly lookups: open galleries past their close
-- time, and closed galleries that still hold photos.
CREATE INDEX "Event_galleryClosedAt_galleryClosesAt_idx" ON "Event"("galleryClosedAt", "galleryClosesAt");
