-- Invite links are only for Participant and Viewer. An organizer link could
-- be forwarded and grants admin rights, so the existing ones go; someone
-- becomes an organizer only when an organizer promotes a member.
DELETE FROM "EventInvite" WHERE "accessLevel" = 'ORGANIZER';
