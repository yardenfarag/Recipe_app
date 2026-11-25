begin;

create extension if not exists pgtap with schema extensions;
select plan(17);

-- PIN-189 (migration 20261125200000_email_opt_out): one opt-out for non-essential email, one for reminder
-- pushes, the signed link that sets the first, and every send path reading them.

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  -- Day-1 nudge age (p_now 2026-12-01 12:00), nothing saved, a phone registered.
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-4000-8000-00000000e001',
   'authenticated', 'authenticated', 'both@pinch.invalid', '', now(), '{}', '{}',
   timestamptz '2026-12-01 12:00+00' - interval '25 hours', now()),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-4000-8000-00000000e002',
   'authenticated', 'authenticated', 'noemail@pinch.invalid', '', now(), '{}', '{}',
   timestamptz '2026-12-01 12:00+00' - interval '25 hours', now()),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-4000-8000-00000000e003',
   'authenticated', 'authenticated', 'nopush@pinch.invalid', '', now(), '{}', '{}',
   timestamptz '2026-12-01 12:00+00' - interval '25 hours', now()),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-4000-8000-00000000e004',
   'authenticated', 'authenticated', 'nothing@pinch.invalid', '', now(), '{}', '{}',
   timestamptz '2026-12-01 12:00+00' - interval '25 hours', now()),
  -- Welcome age: ten minutes old, confirmed.
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-4000-8000-00000000e005',
   'authenticated', 'authenticated', 'welcome-me@pinch.invalid', '', now(), '{}', '{"locale":"he"}',
   now() - interval '10 minutes', now()),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-4000-8000-00000000e006',
   'authenticated', 'authenticated', 'no-welcome@pinch.invalid', '', now(), '{}', '{}',
   now() - interval '10 minutes', now());

insert into public.profiles (id, email)
select id, email from auth.users where id::text like '10000000-0000-4000-8000-00000000e00%'
on conflict (id) do nothing;

insert into public.push_tokens (token, user_id, platform)
values
  ('ExponentPushToken[e001]', '10000000-0000-4000-8000-00000000e001', 'ios'),
  ('ExponentPushToken[e002]', '10000000-0000-4000-8000-00000000e002', 'ios'),
  ('ExponentPushToken[e003]', '10000000-0000-4000-8000-00000000e003', 'android'),
  ('ExponentPushToken[e004]', '10000000-0000-4000-8000-00000000e004', 'ios');

-- Signed link --------------------------------------------------------------------
select is(
  public.email_unsubscribe_token('10000000-0000-4000-8000-00000000e002'),
  public.nudge_unsubscribe_token('10000000-0000-4000-8000-00000000e002'),
  'links in reminder emails sent before PIN-189 stay valid'
);
select is(
  public.email_set_opt_out('10000000-0000-4000-8000-00000000e002', 'wrong', true),
  false, 'a wrong token does nothing'
);
select is(
  public.email_set_opt_out('10000000-0000-4000-8000-00000000e002', null, true),
  false, 'a missing token does nothing'
);
select is(
  (select email_opt_out from public.profiles where id = '10000000-0000-4000-8000-00000000e002'),
  false, 'so the account still gets email'
);
select is(
  public.email_set_opt_out(
    '10000000-0000-4000-8000-00000000e002',
    public.email_unsubscribe_token('10000000-0000-4000-8000-00000000e002'),
    true
  ),
  true, 'the signed link unsubscribes'
);
select is(
  (select row(email_opt_out, push_opt_out)::text from public.profiles where id = '10000000-0000-4000-8000-00000000e002'),
  row(true, false)::text, 'unsubscribing from email leaves reminder pushes on'
);

-- The same link turns email back on (the unsubscribe page's undo).
select public.email_set_opt_out(
  '10000000-0000-4000-8000-00000000e006',
  public.email_unsubscribe_token('10000000-0000-4000-8000-00000000e006'),
  true
);
select public.email_set_opt_out(
  '10000000-0000-4000-8000-00000000e006',
  public.email_unsubscribe_token('10000000-0000-4000-8000-00000000e006'),
  false
);
select is(
  (select email_opt_out from public.profiles where id = '10000000-0000-4000-8000-00000000e006'),
  false, 'the signed link turns email back on'
);

-- Settings: a signed-in user changes their own switches, and nobody else's.
set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated","sub":"10000000-0000-4000-8000-00000000e003"}';
update public.profiles set push_opt_out = true where id = '10000000-0000-4000-8000-00000000e003';
update public.profiles set email_opt_out = true where id = '10000000-0000-4000-8000-00000000e001';
reset role;
select is(
  (select array_agg(row(id, email_opt_out, push_opt_out)::text order by id)
   from public.profiles where id in ('10000000-0000-4000-8000-00000000e001', '10000000-0000-4000-8000-00000000e003')),
  array[
    row('10000000-0000-4000-8000-00000000e001'::uuid, false, false)::text,
    row('10000000-0000-4000-8000-00000000e003'::uuid, false, true)::text
  ],
  'a signed-in user turns their own pushes off and cannot touch another account'
);

-- The old nudges function's unsubscribe (until it's redeployed) turns both channels off, as it promised.
select public.nudge_unsubscribe(
  '10000000-0000-4000-8000-00000000e004',
  public.nudge_unsubscribe_token('10000000-0000-4000-8000-00000000e004')
);
select is(
  (select row(email_opt_out, push_opt_out)::text from public.profiles where id = '10000000-0000-4000-8000-00000000e004'),
  row(true, true)::text, 'the old reminder unsubscribe turns off email and pushes'
);

-- Nudges: each channel has its own switch ------------------------------------------
select is(
  (select row(email, push_tokens)::text
   from public.nudge_candidates('day1', 200, timestamptz '2026-12-01 12:00+00')
   where user_id = '10000000-0000-4000-8000-00000000e001'),
  row('both@pinch.invalid', array['ExponentPushToken[e001]'])::text,
  'an account with both on gets the reminder by email and push'
);
select is(
  (select row(email, push_tokens)::text
   from public.nudge_candidates('day1', 200, timestamptz '2026-12-01 12:00+00')
   where user_id = '10000000-0000-4000-8000-00000000e002'),
  row(null::text, array['ExponentPushToken[e002]'])::text,
  'email off: the reminder comes by push only'
);
select is(
  (select row(email, push_tokens)::text
   from public.nudge_candidates('day1', 200, timestamptz '2026-12-01 12:00+00')
   where user_id = '10000000-0000-4000-8000-00000000e003'),
  row('nopush@pinch.invalid', '{}'::text[])::text,
  'pushes off: the reminder comes by email only'
);
select is(
  (select count(*)::int from public.nudge_candidates('day1', 200, timestamptz '2026-12-01 12:00+00')
   where user_id = '10000000-0000-4000-8000-00000000e004'),
  0, 'both off: no reminder at all'
);

-- Push already sent, email off: nothing left to send, so the account isn't listed.
insert into public.nudge_sends (user_id, kind, channel)
values ('10000000-0000-4000-8000-00000000e002', 'day1', 'push');
select is(
  (select count(*)::int from public.nudge_candidates('day1', 200, timestamptz '2026-12-01 12:00+00')
   where user_id = '10000000-0000-4000-8000-00000000e002'),
  0, 'an opted-out email is not left pending once the push went out'
);

-- Welcome ---------------------------------------------------------------------------
update public.profiles set email_opt_out = true where id = '10000000-0000-4000-8000-00000000e006';
select is(
  (select array_agg(row(email, unsubscribe_token = public.email_unsubscribe_token(user_id))::text)
   from public.welcome_email_candidates(200)
   where user_id::text like '10000000-0000-4000-8000-00000000e00%'),
  array[row('welcome-me@pinch.invalid', true)::text],
  'welcome emails skip accounts that opted out and come with a signed link'
);

-- Grants ----------------------------------------------------------------------------
select ok(
  not has_function_privilege('anon', 'public.email_set_opt_out(uuid, text, boolean)', 'execute')
  and not has_function_privilege('authenticated', 'public.email_set_opt_out(uuid, text, boolean)', 'execute')
  and not has_function_privilege('anon', 'public.email_unsubscribe_token(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.email_unsubscribe_token(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.welcome_email_candidates(int)', 'execute')
  and has_function_privilege('service_role', 'public.email_set_opt_out(uuid, text, boolean)', 'execute'),
  'only the service role signs links and changes the opt-out from one'
);
select ok(
  has_column_privilege('authenticated', 'public.profiles', 'email_opt_out', 'update')
  and has_column_privilege('authenticated', 'public.profiles', 'push_opt_out', 'update')
  and not has_column_privilege('anon', 'public.profiles', 'email_opt_out', 'update'),
  'signed-in users can change both switches from Settings'
);

select * from finish();
rollback;
