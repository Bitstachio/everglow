-- Reports nobody filed: the platform's own checks, starting with upload
-- screening (docs/moderation.md §1, §11). Additive: a new enum value, a column
-- that defaults to USER for every existing report, a partial unique index and
-- a trigger.

-- CreateEnum
CREATE TYPE "ReportSource" AS ENUM ('USER', 'AUTOMATED');

-- AlterEnum
ALTER TYPE "ReportEscalation" ADD VALUE 'AUTOMATED_FLAG';

-- AlterTable
ALTER TABLE "Report" ADD COLUMN     "source" "ReportSource" NOT NULL DEFAULT 'USER';

-- One OPEN automated report per photo.
-- CreateIndex
CREATE UNIQUE INDEX "Report_photoId_key" ON "Report"("photoId") WHERE ("status" = 'OPEN' AND "source" = 'AUTOMATED');

-- Report_user_source_has_reporter_check: a member's report has a reporter
-- when it is filed. A trigger rather than a CHECK, because deleting the
-- reporter's account later sets reporterId to NULL and must still pass.
CREATE FUNCTION "report_user_source_has_reporter"() RETURNS trigger AS $$
BEGIN
  IF NEW."source" = 'USER' AND NEW."reporterId" IS NULL THEN
    RAISE EXCEPTION 'A USER report needs a reporterId when it is filed'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'Report_user_source_has_reporter_check';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Report_user_source_has_reporter_check"
BEFORE INSERT ON "Report"
FOR EACH ROW EXECUTE FUNCTION "report_user_source_has_reporter"();
