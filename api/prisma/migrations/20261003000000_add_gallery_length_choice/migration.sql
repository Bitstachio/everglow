-- Hosts pick how long a gallery stays open (docs/event-quotas.md). A plan lists
-- the lengths it offers; galleryWindowDays stays its longest.
ALTER TABLE "Plan" ADD COLUMN "galleryWindowOptions" INTEGER[] DEFAULT ARRAY[]::INTEGER[];

-- A plan with options offers its longest length among them, so the default a
-- new event gets is always one its host could have picked, and every option is
-- a positive number of days. Not in schema.prisma: Prisma doesn't model checks.
ALTER TABLE "Plan" ADD CONSTRAINT "Plan_galleryWindowOptions_check" CHECK (
  cardinality("galleryWindowOptions") = 0
  OR (
    "galleryWindowDays" IS NOT NULL
    AND "galleryWindowDays" = ANY ("galleryWindowOptions")
    AND "galleryWindowDays" >= ALL ("galleryWindowOptions")
    AND 0 < ALL ("galleryWindowOptions")
  )
);

-- Plan rows never change (a trigger refuses updates), so the free plan's
-- lengths arrive as its version 2. New events get it. Events created before
-- keep version 1, whose empty list means its one length, 30 days.
INSERT INTO "Plan" ("id", "code", "version", "memberLimit", "storageLimitBytes", "galleryWindowDays", "galleryWindowOptions")
VALUES (gen_random_uuid(), 'FREE', 2, 30, 3221225472, 30, ARRAY[3, 7, 14, 30]);

-- The length each event's host picked, and when its gallery opens. Events
-- created before this have their plan's one length, and have been open since
-- they were created.
ALTER TABLE "Event" ADD COLUMN "galleryWindowDays" INTEGER,
ADD COLUMN "galleryOpensAt" TIMESTAMP(3);

UPDATE "Event" AS e
SET "galleryWindowDays" = p."galleryWindowDays", "galleryOpensAt" = e."createdAt"
FROM "Plan" AS p
WHERE p."id" = e."planId";

ALTER TABLE "Event" ALTER COLUMN "galleryOpensAt" SET NOT NULL;
