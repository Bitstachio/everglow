-- Drop profile email; Auth0 holds the login email. Username is the public handle.

-- DropIndex
DROP INDEX IF EXISTS "UserDetails_email_key";

-- AlterTable
ALTER TABLE "UserDetails" DROP COLUMN "email";
