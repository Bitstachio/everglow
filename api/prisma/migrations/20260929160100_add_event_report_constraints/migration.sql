-- One OPEN report per member about the event itself.
CREATE UNIQUE INDEX "Report_reporterId_eventId_key" ON "Report"("reporterId", "eventId") WHERE ("status" = 'OPEN' AND "targetType" = 'EVENT');

-- An EVENT report is about the event, not a photo (already enforced by
-- Report_member_target_has_no_photo_check, which allows a photo only on PHOTO
-- reports) and not a member. Written so a later SET NULL still passes.
ALTER TABLE "Report" ADD CONSTRAINT "Report_event_target_has_no_user_check" CHECK ("targetType" <> 'EVENT' OR "reportedUserId" IS NULL);
