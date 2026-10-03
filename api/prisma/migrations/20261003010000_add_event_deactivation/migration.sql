-- An organizer can deactivate an event, closing its gallery now
-- (docs/event-quotas.md). The event records when, and who: attribution only,
-- so it goes null with that account, as Event.coverUpdatedById does.
ALTER TABLE "Event" ADD COLUMN     "deactivatedAt" TIMESTAMP(3),
ADD COLUMN     "deactivatedById" UUID;

-- The rows SET NULL has to find when an account is deleted.
CREATE INDEX "Event_deactivatedById_idx" ON "Event"("deactivatedById");

ALTER TABLE "Event" ADD CONSTRAINT "Event_deactivatedById_fkey" FOREIGN KEY ("deactivatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
