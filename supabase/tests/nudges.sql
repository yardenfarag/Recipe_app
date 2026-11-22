begin;

create extension if not exists pgtap with schema extensions;
select plan(16);

-- Nudges (migration 20261122191000_nudges): who is due, push token ownership, unsubscribe, grants.
-- Times are relative to a fixed "now" after the launch date, passed as p_now.

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  -- day1: a day old, nothing saved
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-4000-8000-00000000d001',
   'authenticated', 'authenticated', 'new@pinch.invalid', '', now(), '{}', '{"locale":"he"}',
   timestamptz '2026-12-01 12:00+00' - interval '25 hours', now()),
  -- day1 age but already saved a recipe
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-4000-8000-00000000d002',
   'authenticated', 'authenticated', 'saver@pinch.invalid', '', now(), '{}', '{}',
   timestamptz '2026-12-01 12:00+00' - interval '25 hours', now()),
  -- day3: saved, never cooked
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-4000-8000-00000000d003',
   'authenticated', 'authenticated', 'cookless@pinch.invalid', '', now(), '{}', '{}',
   timestamptz '2026-12-01 12:00+00' - interval '73 hours', now()),
  -- day3 age, cooked already
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-4000-8000-00000000d004',
   'authenticated', 'authenticated', 'cook@pinch.invalid', '', now(), '{}', '{}',
   timestamptz '2026-12-01 12:00+00' - interval '73 hours', now()),
  -- signed up before the launch date: never nudged
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-4000-8000-00000000d005',
   'authenticated', 'authenticated', 'old@pinch.invalid', '', now(), '{}', '{}',
   timestamptz '2026-11-20 12:00+00', now());

insert into public.profiles (id, email)
select id, email from auth.users where id::text like '10000000-0000-4000-8000-00000000d00%'
on conflict (id) do nothing;

insert into public.recipes (user_id, title, original_url, platform, ingredients, instructions, last_cooked_at)
values
  ('10000000-0000-4000-8000-00000000d002', 'Saved', 'https://example.com/a', 'web', '[{"name":"egg","quantity":1,"unit":""}]', '[{"step":1,"text":"Boil"}]', null),
  ('10000000-0000-4000-8000-00000000d003', 'Older', 'https://example.com/b', 'web', '[{"name":"egg","quantity":1,"unit":""}]', '[{"step":1,"text":"Boil"}]', null),
  ('10000000-0000-4000-8000-00000000d004', 'Cooked', 'https://example.com/c', 'web', '[{"name":"egg","quantity":1,"unit":""}]', '[{"step":1,"text":"Boil"}]', now());
insert into public.recipes (user_id, title, original_url, platform, ingredients, instructions, created_at)
values ('10000000-0000-4000-8000-00000000d003', 'Lemon pasta', 'https://example.com/d', 'web', '[{"name":"egg","quantity":1,"unit":""}]', '[{"step":1,"text":"Boil"}]', now() + interval '1 minute');

select is(
  (select array_agg(user_id::text order by user_id)
   from public.nudge_candidates('day1', 200, timestamptz '2026-12-01 12:00+00')
   where user_id::text like '10000000-0000-4000-8000-00000000d00%'),
  array['10000000-0000-4000-8000-00000000d001'],
  'day1 goes to a day-old account with nothing saved'
);

select is(
  (select row(user_id::text, recipe_title, locale)::text
   from public.nudge_candidates('day3', 200, timestamptz '2026-12-01 12:00+00')
   where user_id::text like '10000000-0000-4000-8000-00000000d00%'),
  row('10000000-0000-4000-8000-00000000d003', 'Lemon pasta', null::text)::text,
  'day3 goes to a saver who cooked nothing, naming their newest recipe'
);

select is(
  (select count(*)::int from public.nudge_candidates('day1', 200, timestamptz '2026-12-03 12:00+00')
   where user_id = '10000000-0000-4000-8000-00000000d001'),
  0, 'day1 is not sent once its one-day window has passed'
);

select is(
  (select count(*)::int from public.nudge_candidates('weekly', 200, timestamptz '2026-12-01 12:00+00')),
  0, 'an unknown nudge matches nobody'
);

select ok(
  (select unsubscribe_token ~ '^[0-9a-f]{64}$' and push_tokens = '{}' and not email_sent and not push_sent
   from public.nudge_candidates('day1', 200, timestamptz '2026-12-01 12:00+00')
   where user_id = '10000000-0000-4000-8000-00000000d001'),
  'a candidate comes with a signed unsubscribe token'
);

-- Once the email went out and there is no phone, the account is done.
insert into public.nudge_sends (user_id, kind, channel)
values ('10000000-0000-4000-8000-00000000d001', 'day1', 'email');
select is(
  (select count(*)::int from public.nudge_candidates('day1', 200, timestamptz '2026-12-01 12:00+00')
   where user_id = '10000000-0000-4000-8000-00000000d001'),
  0, 'an account is not nudged twice'
);

-- Push tokens --------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated","sub":"10000000-0000-4000-8000-00000000d001"}';
select lives_ok(
  $$ select public.register_push_token('ExponentPushToken[phone1]', 'ios') $$,
  'a signed-in user registers their phone'
);
select throws_ok(
  $$ select public.register_push_token('not a token', 'ios') $$,
  '23514', null, 'only Expo push tokens are stored'
);
select throws_ok(
  $$ select * from public.push_tokens $$,
  '42501', null, 'users cannot read push tokens directly'
);
reset role;

select is(
  (select push_tokens from public.nudge_candidates('day1', 200, timestamptz '2026-12-01 12:00+00')
   where user_id = '10000000-0000-4000-8000-00000000d001'),
  array['ExponentPushToken[phone1]'],
  'a registered phone brings the account back for its push'
);

-- The same phone signs in to another account: the token moves.
set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated","sub":"10000000-0000-4000-8000-00000000d002"}';
select public.register_push_token('ExponentPushToken[phone1]', 'ios');
select public.unregister_push_token('ExponentPushToken[nothing]');
reset role;
select is(
  (select user_id::text from public.push_tokens where token = 'ExponentPushToken[phone1]'),
  '10000000-0000-4000-8000-00000000d002',
  'a phone belongs to the account last signed in on it'
);

-- Unsubscribe ----------------------------------------------------------------------
select is(
  public.nudge_unsubscribe('10000000-0000-4000-8000-00000000d003', 'wrong'),
  false, 'a wrong token does nothing'
);
select is(
  public.nudge_unsubscribe(
    '10000000-0000-4000-8000-00000000d003',
    public.nudge_unsubscribe_token('10000000-0000-4000-8000-00000000d003')
  ),
  true, 'the signed link unsubscribes'
);
select is(
  (select count(*)::int from public.nudge_candidates('day3', 200, timestamptz '2026-12-01 12:00+00')
   where user_id = '10000000-0000-4000-8000-00000000d003'),
  0, 'an unsubscribed account gets no more nudges'
);

-- Grants ---------------------------------------------------------------------------
select ok(
  not has_function_privilege('anon', 'public.nudge_candidates(text, int, timestamptz)', 'execute')
  and not has_function_privilege('authenticated', 'public.nudge_candidates(text, int, timestamptz)', 'execute')
  and not has_function_privilege('anon', 'public.nudge_unsubscribe(uuid, text)', 'execute')
  and not has_function_privilege('authenticated', 'public.nudge_unsubscribe(uuid, text)', 'execute')
  and not has_function_privilege('authenticated', 'public.nudge_unsubscribe_token(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.register_push_token(text, text)', 'execute')
  and has_function_privilege('authenticated', 'public.register_push_token(text, text)', 'execute'),
  'only the service role lists, signs and unsubscribes; signed-in users register phones'
);
select ok(
  not has_table_privilege('authenticated', 'public.nudge_sends', 'select')
  and not has_table_privilege('anon', 'public.push_tokens', 'insert')
  and has_column_privilege('authenticated', 'public.profiles', 'nudges_opt_out', 'update'),
  'clients cannot read sends or write tokens directly, and can turn nudges off'
);

select * from finish();
rollback;
