-- Rename the middle AccessLevel value. Existing EventAccess and EventInvite rows keep working.
ALTER TYPE "AccessLevel" RENAME VALUE 'PARTICIPANT' TO 'CONTRIBUTOR';
