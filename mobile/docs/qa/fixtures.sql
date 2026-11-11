-- QA fixtures for the local Docker database. They put one roll in each
-- lifecycle state around a signed-in test account, so the regression suite
-- can be run without waiting for real dates to pass.
--
-- Usage (from the repo root, with `api/docker-compose.yml` running):
--
--   docker exec -i everglow-api-db-1 psql -U everglow_dev -d everglow_db \
--     -v ON_ERROR_STOP=1 -v me="'<your User.id>'" < mobile/docs/qa/fixtures.sql
--
-- Find your User.id with:
--   select u.id, d.username from "User" u join "UserDetails" d on d."userId" = u.id;
--
-- The script also needs a second onboarded user to act as the other host.
-- It uses the seeded Leila Haddad (11111111-…) and Marcus Bell (22222222-…).
--
-- Remove everything it made with:
--   delete from "Event" where title like 'QA ·%';
--   delete from "UserBlock" where "blockerId" = :me;

begin;

with defs(title, host_is_me, my_level, opens, closes, closed, review, susp) as (values
  ('QA · Upcoming (host)',  true,  'ORGANIZER',   now() + interval '2 days',  now() + interval '9 days',  null::timestamp, null::timestamp, null::timestamp),
  ('QA · Upcoming (guest)', false, 'PARTICIPANT', now() + interval '1 day',   now() + interval '8 days',  null, null, null),
  ('QA · Last day',         false, 'ORGANIZER',   now() - interval '6 days',  now() + interval '5 hours', null, null, null),
  ('QA · View only',        false, 'VIEWER',      now() - interval '1 day',   now() + interval '6 days',  null, null, null),
  ('QA · Closed',           false, 'PARTICIPANT', now() - interval '20 days', now() - interval '13 days', now() - interval '13 days', null, null),
  ('QA · Under review',     false, 'PARTICIPANT', now() - interval '1 day',   now() + interval '6 days',  null, now(), null),
  ('QA · Suspended',        false, 'PARTICIPANT', now() - interval '1 day',   now() + interval '6 days',  null, null, now())
), events as (
  insert into "Event"(id, title, description, date, "creatorId", "invitationUrl", "planId",
                      "galleryWindowDays", "galleryOpensAt", "galleryClosesAt", "galleryClosedAt",
                      "underReviewAt", "suspendedAt", "updatedAt")
  select gen_random_uuid(), title, 'QA fixture', opens,
         case when host_is_me then :me::uuid else '11111111-1111-4111-8111-111111111111'::uuid end,
         'qa-' || substr(md5(random()::text), 1, 16),
         (select id from "Plan" where code = 'FREE' order by version desc limit 1),
         7, opens, closes, closed, review, susp, now()
  from defs
  returning id, title
)
insert into "EventAccess"(id, "userId", "eventId", "accessLevel", "updatedAt")
select gen_random_uuid(), :me::uuid, e.id, d.my_level::"AccessLevel", now()
  from events e join defs d using (title)
union all
select gen_random_uuid(), '11111111-1111-4111-8111-111111111111'::uuid, e.id, 'ORGANIZER'::"AccessLevel", now()
  from events e join defs d using (title) where not d.host_is_me
union all
select gen_random_uuid(), '22222222-2222-4222-8222-222222222222'::uuid, e.id, 'PARTICIPANT'::"AccessLevel", now()
  from events e;

-- Both envelopes for every fixture roll, as POST /events creates them.
insert into "EventInvite"(id, "eventId", token, "accessLevel", "updatedAt")
select gen_random_uuid(), e.id, gen_random_uuid()::text, lvl::"AccessLevel", now()
from "Event" e cross join (values ('PARTICIPANT'), ('VIEWER')) v(lvl)
where e.title like 'QA ·%'
on conflict do nothing;

commit;

-- Join-refusal setup (run after the cases that need you to be a member):
-- take yourself out of the rolls whose envelopes should refuse you, ban
-- yourself from the view-only roll, and block its host for the upcoming one.
--
--   delete from "EventAccess" a using "Event" e
--    where a."eventId" = e.id and a."userId" = :me
--      and e.title in ('QA · Closed','QA · Under review','QA · Suspended','QA · Upcoming (guest)','QA · View only');
--   insert into "EventBan"(id, "eventId", "userId", "bannedById")
--     select gen_random_uuid(), id, :me, '11111111-1111-4111-8111-111111111111' from "Event" where title = 'QA · View only';
--   insert into "UserBlock"(id, "blockerId", "blockedId")
--     values (gen_random_uuid(), :me, '11111111-1111-4111-8111-111111111111');
--
-- Envelope tokens for deep links (everglowmobile:///join/<token>):
--   select e.title, i."accessLevel", i.token from "EventInvite" i
--     join "Event" e on e.id = i."eventId" where e.title like 'QA ·%' order by 1, 2;
