begin;

create extension if not exists pgtap with schema extensions;
select plan(26);

-- PIN-153: limits per caller on the website support form, support tickets, feedback and
-- interaction events.

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-4000-8000-000000000a01',
   'authenticated', 'authenticated', 'limits-one@pinch.invalid', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-4000-8000-000000000a02',
   'authenticated', 'authenticated', 'limits-two@pinch.invalid', '', now(), '{}', '{}', now(), now());

-- The caller's address --------------------------------------------------------
select is(public.request_ip_key(), null, 'no address outside an API request');

set local request.headers = '{"x-forwarded-for":"203.0.113.9, 10.0.0.1"}';
select ok(
  public.request_ip_key() ~ '^[0-9a-f]{64}$' and public.request_ip_key() not like '%203.0.113.9%',
  'the address is stored as a hash, never as itself'
);
create temporary table ip_keys as select public.request_ip_key() as first_hop;
set local request.headers = '{"x-forwarded-for":"203.0.113.9"}';
select is(public.request_ip_key(), (select first_hop from ip_keys), 'x-forwarded-for: the first address counts');
set local request.headers = '{"cf-connecting-ip":"198.51.100.7","x-forwarded-for":"203.0.113.9"}';
select isnt(public.request_ip_key(), (select first_hop from ip_keys), 'Cloudflare''s header wins over x-forwarded-for');
grant select on ip_keys to anon, authenticated;

-- Website support form: 5 an hour per address ------------------------------------
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
set local request.headers = '{"x-forwarded-for":"203.0.113.50"}';

select lives_ok(
  $$ select public.submit_website_feedback('Message number ' || n, 'visitor' || n || '@example.com', 'en')
     from generate_series(1, 5) n $$,
  'one visitor can send five messages in an hour'
);
select throws_ok(
  $$ select public.submit_website_feedback('A sixth message', 'visitor6@example.com', 'en') $$,
  'P0001', 'rate_limited',
  'the sixth from the same address is refused'
);

set local request.headers = '{"x-forwarded-for":"203.0.113.51"}';
select lives_ok(
  $$ select public.submit_website_feedback('Hello from someone else', 'other@example.com', 'en') $$,
  'another visitor is not affected'
);

-- 5 an hour per reply address, whatever address the messages come from.
select lives_ok(
  $$ select public.submit_website_feedback('Same reply address ' || n, 'Repeat@Example.com', 'en')
     from generate_series(1, 4) n $$,
  'the same reply address is fine up to the limit'
);
set local request.headers = '{"x-forwarded-for":"203.0.113.52"}';
select lives_ok(
  $$ select public.submit_website_feedback('Fifth for this reply address', 'repeat@example.com', 'en') $$,
  'the limit counts the address without case'
);
set local request.headers = '{"x-forwarded-for":"203.0.113.53"}';
select throws_ok(
  $$ select public.submit_website_feedback('Sixth for this reply address', 'repeat@example.com', 'en') $$,
  'P0001', 'rate_limited',
  'a reply address used five times is refused from any address'
);
select throws_ok(
  $$ select public.submit_website_feedback('x', null, 'en') $$,
  'P0001', 'invalid_message',
  'the message checks still apply'
);

-- Clients can't reach the counter itself.
select throws_ok(
  $$ select count(*) from public.request_rate_events $$,
  '42501', null, 'visitors cannot read the rate counter'
);
select throws_ok(
  $$ select public.take_rate_limit('website_feedback', 'x', interval '1 hour', 5) $$,
  '42501', null, 'visitors cannot call take_rate_limit'
);

-- Support tickets and feedback: 5 an hour per user ----------------------------------
reset role;
set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated","sub":"10000000-0000-4000-8000-000000000a01"}';

select lives_ok(
  $$ insert into public.support_tickets (user_id, email, category, message)
     select '10000000-0000-4000-8000-000000000a01', 'limits-one@pinch.invalid', 'bug', 'Ticket number ' || n
     from generate_series(1, 5) n $$,
  'a user can open five tickets in an hour'
);
select throws_ok(
  $$ insert into public.support_tickets (user_id, email, category, message)
     values ('10000000-0000-4000-8000-000000000a01', 'limits-one@pinch.invalid', 'bug', 'One too many') $$,
  'P0001', 'rate_limited',
  'the sixth ticket is refused'
);
select lives_ok(
  $$ insert into public.feedback (user_id, message, platform)
     select '10000000-0000-4000-8000-000000000a01', 'Feedback number ' || n, 'ios'
     from generate_series(1, 5) n $$,
  'feedback has its own five an hour'
);
select throws_ok(
  $$ insert into public.feedback (user_id, message, platform)
     values ('10000000-0000-4000-8000-000000000a01', 'One too many', 'ios') $$,
  'P0001', 'rate_limited',
  'the sixth feedback is refused'
);

set local request.jwt.claims = '{"role":"authenticated","sub":"10000000-0000-4000-8000-000000000a02"}';
select lives_ok(
  $$ insert into public.support_tickets (user_id, email, category, message)
     values ('10000000-0000-4000-8000-000000000a02', 'limits-two@pinch.invalid', 'other', 'My first ticket') $$,
  'another user is not affected'
);
select throws_ok(
  $$ insert into public.support_tickets (user_id, email, category, message)
     values ('10000000-0000-4000-8000-000000000a02', 'limits-two@pinch.invalid', 'other', repeat('x', 4001)) $$,
  'P0001', 'invalid_message',
  'a ticket over 4,000 characters is refused'
);

-- Interaction events ---------------------------------------------------------------
-- Signed in: 1,500 events per 10 minutes per user, across any number of made-up sessions.
reset role;
insert into public.interaction_events (user_id, session_id, kind, name, platform, occurred_at)
select '10000000-0000-4000-8000-000000000a01', gen_random_uuid(), 'tap', 'flood.tap', 'ios', now()
from generate_series(1, 1500);

set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated","sub":"10000000-0000-4000-8000-000000000a01"}';
select public.log_interaction_events(
  gen_random_uuid(), null, 'ios', '1.0.10', '[{"kind":"tap","name":"over.user.cap"}]'::jsonb);
reset role;
select is(
  (select count(*)::int from public.interaction_events where name = 'over.user.cap'),
  0, 'a signed-in user over 1,500 events in 10 minutes is dropped, new session or not'
);

set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated","sub":"10000000-0000-4000-8000-000000000a02"}';
select public.log_interaction_events(
  gen_random_uuid(), null, 'ios', '1.0.10', '[{"kind":"tap","name":"other.user.ok"}]'::jsonb);
reset role;
select is(
  (select count(*)::int from public.interaction_events where name = 'other.user.ok'),
  1, 'another user still logs events'
);

-- Visitors: 1,500 per install id.
insert into public.interaction_events (guest_install_id, session_id, kind, name, platform, occurred_at)
select 'install-flood-1', gen_random_uuid(), 'tap', 'flood.tap', 'web', now()
from generate_series(1, 1500);

set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
set local request.headers = '{"x-forwarded-for":"203.0.113.60"}';
select public.log_interaction_events(
  gen_random_uuid(), 'install-flood-1', 'web', '1.0.10', '[{"kind":"tap","name":"over.install.cap"}]'::jsonb);
reset role;
select is(
  (select count(*)::int from public.interaction_events where name = 'over.install.cap'),
  0, 'an install id over 1,500 events in 10 minutes is dropped'
);

-- Visitors: 3,000 per address, however many install and session ids it makes up.
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
set local request.headers = '{"x-forwarded-for":"203.0.113.61"}';
select public.log_interaction_events(
  gen_random_uuid(), 'install-many-' || n, 'web', '1.0.10',
  (select jsonb_agg(jsonb_build_object('kind', 'tap', 'name', 'address.flood')) from generate_series(1, 50)))
from generate_series(1, 61) n;
reset role;
select is(
  (select count(*)::int from public.interaction_events where name = 'address.flood'),
  3000, 'one address logs at most 3,000 visitor events in 10 minutes'
);

set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
set local request.headers = '{"x-forwarded-for":"203.0.113.62"}';
select public.log_interaction_events(
  gen_random_uuid(), 'install-elsewhere', 'web', '1.0.10', '[{"kind":"tap","name":"other.address.ok"}]'::jsonb);
reset role;
select is(
  (select count(*)::int from public.interaction_events where name = 'other.address.ok'),
  1, 'another address still logs events'
);

-- Retention ------------------------------------------------------------------------
insert into public.request_rate_events (bucket, key, created_at)
values ('website_feedback', 'old-key', now() - interval '2 days'),
       ('website_feedback', 'new-key', now() - interval '2 hours');
select public.purge_expired_personal_data();
select is(
  (select array_agg(key order by key) from public.request_rate_events where key in ('old-key', 'new-key')),
  array['new-key'],
  'the daily purge deletes rate counter rows after a day'
);

select is(
  (
    select count(*)::int
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('request_ip_key', 'take_rate_limit', 'limit_support_tickets', 'limit_feedback')
      and (has_function_privilege('anon', p.oid, 'execute')
           or has_function_privilege('authenticated', p.oid, 'execute'))
  ),
  0,
  'clients cannot execute the limit helpers'
);

select * from finish();
rollback;
