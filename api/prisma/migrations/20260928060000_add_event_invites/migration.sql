-- CreateTable
CREATE TABLE "EventInvite" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "token" VARCHAR(100) NOT NULL,
    "accessLevel" "AccessLevel" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventInvite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EventInvite_token_key" ON "EventInvite"("token");

-- CreateIndex
CREATE INDEX "EventInvite_eventId_idx" ON "EventInvite"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "EventInvite_eventId_accessLevel_key" ON "EventInvite"("eventId", "accessLevel");

-- AddForeignKey
ALTER TABLE "EventInvite" ADD CONSTRAINT "EventInvite_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: existing Event.invitationUrl becomes the PARTICIPANT invite.
INSERT INTO "EventInvite" ("id", "eventId", "token", "accessLevel", "createdAt", "updatedAt")
SELECT gen_random_uuid(), "id", "invitationUrl", 'PARTICIPANT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Event";

-- Seed VIEWER and ORGANIZER invites for every existing event.
INSERT INTO "EventInvite" ("id", "eventId", "token", "accessLevel", "createdAt", "updatedAt")
SELECT gen_random_uuid(), "id", gen_random_uuid()::text, 'VIEWER', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Event";

INSERT INTO "EventInvite" ("id", "eventId", "token", "accessLevel", "createdAt", "updatedAt")
SELECT gen_random_uuid(), "id", gen_random_uuid()::text, 'ORGANIZER', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Event";
