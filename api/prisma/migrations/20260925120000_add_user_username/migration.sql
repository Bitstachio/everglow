-- Add username (nullable), backfill from email local part, then require it.
-- Email becomes nullable so onboarding can omit it while Auth0 still holds login email.

-- AlterTable
ALTER TABLE "UserDetails" ADD COLUMN "username" VARCHAR(30);

-- AlterTable
ALTER TABLE "UserDetails" ALTER COLUMN "email" DROP NOT NULL;

-- Backfill usernames from the email local part: lowercase, strip to [a-z0-9._],
-- pad to 3 characters, numeric suffix on collision. Reserved names get a suffix
-- so existing rows remain unique and usable.
DO $$
DECLARE
  r RECORD;
  base TEXT;
  candidate TEXT;
  suffix INT;
BEGIN
  FOR r IN SELECT id, email FROM "UserDetails" ORDER BY id LOOP
    base := lower(regexp_replace(split_part(COALESCE(r.email, ''), '@', 1), '[^a-z0-9._]', '', 'g'));

    IF base = '' THEN
      base := 'usr';
    ELSIF length(base) < 3 THEN
      base := rpad(base, 3, 'x');
    ELSIF length(base) > 30 THEN
      base := left(base, 30);
    END IF;

    IF base IN ('admin', 'everglow', 'support', 'api') THEN
      base := left(base, 29) || '1';
    END IF;

    candidate := base;
    suffix := 1;
    WHILE EXISTS (SELECT 1 FROM "UserDetails" WHERE username = candidate) LOOP
      suffix := suffix + 1;
      candidate := left(base, greatest(1, 30 - length(suffix::text))) || suffix::text;
    END LOOP;

    UPDATE "UserDetails" SET username = candidate WHERE id = r.id;
  END LOOP;
END $$;

-- AlterTable
ALTER TABLE "UserDetails" ALTER COLUMN "username" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "UserDetails_username_key" ON "UserDetails"("username");
