-- Plans become a versioned, immutable catalog (docs/event-quotas.md, "How
-- it's built"). Each event points at the plan version it was created on, so
-- changing a plan later (a new version) never changes events already created
-- or sold, and new kinds of limit are new Plan columns, never Event columns.

-- CreateTable
CREATE TABLE "Plan" (
    "id" UUID NOT NULL,
    "code" "EventPlan" NOT NULL,
    "version" INTEGER NOT NULL,
    "memberLimit" INTEGER,
    "storageLimitBytes" BIGINT,
    "galleryWindowDays" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Plan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Plan_code_version_key" ON "Plan"("code", "version");

-- The free plan's first version: 30 members, 3 GB, a 30-day window.
INSERT INTO "Plan" ("id", "code", "version", "memberLimit", "storageLimitBytes", "galleryWindowDays")
VALUES (gen_random_uuid(), 'FREE', 1, 30, 3221225472, 30);

-- Every existing event is FREE (the enum has no other value yet), so each
-- points at FREE version 1. Added nullable, backfilled, then made required.
ALTER TABLE "Event" ADD COLUMN "planId" UUID,
ADD COLUMN "bonusStorageBytes" BIGINT NOT NULL DEFAULT 0;

UPDATE "Event" SET "planId" = (SELECT "id" FROM "Plan" WHERE "code" = 'FREE' AND "version" = 1);

ALTER TABLE "Event" ALTER COLUMN "planId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "Event_planId_idx" ON "Event"("planId");

-- AddForeignKey: a plan version an event uses can never be deleted.
ALTER TABLE "Event" ADD CONSTRAINT "Event_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- The plan now comes from the row; the enum column it replaces goes.
ALTER TABLE "Event" DROP COLUMN "plan";

-- Plan rows never change once written. Changing a plan's terms means
-- inserting its next version; events keep the version they point at.
CREATE FUNCTION "plan_rows_are_immutable"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Plan rows are immutable: insert a new version of the plan instead';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "plan_rows_are_immutable"
BEFORE UPDATE ON "Plan"
FOR EACH ROW EXECUTE FUNCTION "plan_rows_are_immutable"();
