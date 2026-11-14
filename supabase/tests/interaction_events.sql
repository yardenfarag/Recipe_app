begin;

create extension if not exists pgtap with schema extensions;
select plan(16);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-4000-8000-000000000091',
   'authenticated', 'authenticated', 'tapper@pinch.invalid', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-4000-8000-000000000092',
   'authenticated', 'authenticated', 'admin@pinch.invalid', '', now(), '{}', '{}', now(), now());

update public.profiles set is_admin = true where id = '10000000-0000-4000-8000-000000000092';

-- Guests -------------------------------------------------------------------
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

select lives_ok(
  $$ select public.log_interaction_events(
       '20000000-0000-4000-8000-000000000001', 'install-tap-guest-1', 'ios', '1.0.9',
       '[{"kind":"screen","name":"/(tabs)/hub","at":"2020-01-01T00:00:00Z"},
         {"kind":"tap","name":"hub.card.open","screen":"/(tabs)/hub"}]'::jsonb) $$,
  'a guest can log a batch'
);

select throws_ok(
  $$ select count(*) from public.interaction_events $$,
  '42501', null, 'guests cannot read the table'
);

select throws_ok(
  $$ insert into public.interaction_events (guest_install_id, session_id, kind, name, platform, occurred_at)
     values ('install-tap-guest-1', gen_random_uuid(), 'tap', 'x', 'ios', now()) $$,
  '42501', null, 'guests cannot insert directly'
);

select throws_ok(
  $$ select public.log_interaction_events(
       '20000000-0000-4000-8000-000000000001', 'install-tap-guest-1', 'ios', '1.0.9',
       '[{"kind":"tap","name":"My Lasagna Recipe!"}]'::jsonb) $$,
  '23514', null, 'free text is rejected as a name'
);

select throws_ok(
  $$ select public.log_interaction_events(
       '20000000-0000-4000-8000-000000000001', 'install-tap-guest-1', 'ios', '1.0.9',
       (select jsonb_agg(jsonb_build_object('kind','tap','name','x')) from generate_series(1, 51))) $$,
  '22023', null, 'batches over 50 are rejected'
);

select throws_ok(
  $$ select public.admin_interaction_top(now() - interval '1 day') $$,
  '42501', null, 'guests cannot use admin reads'
);

-- Signed-in user ----------------------------------------------------------
reset role;
set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated","sub":"10000000-0000-4000-8000-000000000091"}';

select lives_ok(
  $$ select public.log_interaction_events(
       '20000000-0000-4000-8000-000000000002', 'install-tap-user-1', 'android', '1.0.9',
       '[{"kind":"auth","name":"auth.login","properties":{"method":"google"}},
         {"kind":"tap","name":"recipe.save","screen":"/recipe/[id]"}]'::jsonb) $$,
  'a signed-in user can log a batch'
);

select throws_ok(
  $$ select * from public.admin_interaction_sessions(now() - interval '1 day') $$,
  '42501', null, 'non-admins cannot list sessions'
);

-- Admin ------------------------------------------------------------------
set local request.jwt.claims = '{"role":"authenticated","sub":"10000000-0000-4000-8000-000000000092"}';

select is(
  (select user_id from public.admin_interaction_sessions(now() - interval '1 day', 'tapper@pinch')),
  '10000000-0000-4000-8000-000000000091'::uuid,
  'admins find a session by email, owned by the JWT user'
);

select is(
  (select guest_install_id from public.admin_interaction_sessions(now() - interval '1 day', 'tapper@pinch')),
  null,
  'signed-in rows do not keep the install id'
);

select is(
  (select auth_events from public.admin_interaction_sessions(now() - interval '1 day', 'tapper@pinch')),
  array['auth.login'],
  'sessions list their auth events'
);

select is(
  (select array_agg(name order by occurred_at, id)
   from public.admin_interaction_session_events('20000000-0000-4000-8000-000000000001')),
  array['/(tabs)/hub', 'hub.card.open'],
  'admins read a session timeline in order'
);

select ok(
  (select occurred_at > now() - interval '1 minute'
   from public.admin_interaction_session_events('20000000-0000-4000-8000-000000000001')
   where name = '/(tabs)/hub'),
  'a device clock far in the past falls back to server time'
);

-- No timed purge; erasure --------------------------------------------------
reset role;

insert into public.interaction_events (guest_install_id, session_id, kind, name, platform, occurred_at, created_at)
values ('install-tap-old', gen_random_uuid(), 'tap', 'old.tap', 'web', now() - interval '91 days', now() - interval '91 days');

select public.purge_expired_personal_data();

select is(
  (select count(*)::int from public.interaction_events where guest_install_id = 'install-tap-old'),
  1, 'the daily purge keeps old events'
);

-- The same session had guest rows before sign-in.
insert into public.interaction_events (guest_install_id, session_id, kind, name, platform, occurred_at)
values ('install-tap-user-1', '20000000-0000-4000-8000-000000000002', 'screen', '/auth', 'android', now());

select public.erase_user_personal_data('10000000-0000-4000-8000-000000000091');

select is(
  (select count(*)::int from public.interaction_events
   where session_id = '20000000-0000-4000-8000-000000000002'),
  0, 'erasing an account removes its events, including guest rows in its sessions'
);

select is(
  (select count(*)::int from public.interaction_events
   where session_id = '20000000-0000-4000-8000-000000000001'),
  2, 'other people''s events stay'
);

select * from finish();
rollback;
