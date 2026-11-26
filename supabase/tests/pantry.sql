begin;

create extension if not exists pgtap with schema extensions;
select plan(20);

-- PIN-181 (migration 20261126120000_pantry): each person sees and changes only their own pantry, scan
-- photos come only from the functions, handoffs are out of reach for clients, and the purge keeps its
-- promises. Since 20261126130000_households the pantry belongs to a household; A and B are each in a household
-- of one here, and households.sql tests sharing it.

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-4000-8000-0000000fa001',
   'authenticated', 'authenticated', 'pantry-a@pinch.invalid', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-4000-8000-0000000fa002',
   'authenticated', 'authenticated', 'pantry-b@pinch.invalid', '', now(), '{}', '{}', now(), now());

insert into public.profiles (id, email)
select id, email from auth.users where id::text like '10000000-0000-4000-8000-0000000fa00%'
on conflict (id) do nothing;

-- The functions write scan photos and handoffs with the service role.
insert into public.pantry_scan_photos (user_id, scan_id, place, quality, items)
values
  ('10000000-0000-4000-8000-0000000fa001', '20000000-0000-4000-8000-0000000fa001', 'fridge', 'ok',
   '[{"name":"milk","name_en":"milk"}]'),
  ('10000000-0000-4000-8000-0000000fa002', '20000000-0000-4000-8000-0000000fa002', 'fridge', 'ok', '[]'),
  ('10000000-0000-4000-8000-0000000fa001', '20000000-0000-4000-8000-0000000fa003', 'cupboard', 'ok', '[]');
update public.pantry_scan_photos set created_at = now() - interval '8 days'
where scan_id = '20000000-0000-4000-8000-0000000fa003';

insert into public.photo_handoffs (user_id, token_hash, purpose, scan_id, expires_at)
values ('10000000-0000-4000-8000-0000000fa001', 'hash-pantry', 'pantry', '20000000-0000-4000-8000-0000000fa001',
        now() + interval '15 minutes');
insert into public.photo_handoffs (user_id, token_hash, purpose, expires_at, photo, photo_mime, photo_at)
values
  ('10000000-0000-4000-8000-0000000fa001', 'hash-fresh', 'snap', now() + interval '10 minutes',
   '\xffd8ff', 'image/jpeg', now() - interval '2 minutes'),
  ('10000000-0000-4000-8000-0000000fa001', 'hash-stale', 'guess', now() + interval '1 minute',
   '\xffd8ff', 'image/jpeg', now() - interval '16 minutes'),
  ('10000000-0000-4000-8000-0000000fa001', 'hash-old', 'snap', now() - interval '2 days', null, null, null);

-- Person A, signed in ---------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated","sub":"10000000-0000-4000-8000-0000000fa001"}';

insert into public.pantry_items (user_id, name, name_en, place, aisle, source)
values ('10000000-0000-4000-8000-0000000fa001', 'חלב', 'Milk', 'fridge', 'dairy', 'scan');

select throws_ok(
  $$ insert into public.pantry_items (user_id, name, name_en, place) values
     ('10000000-0000-4000-8000-0000000fa001', 'milk', ' milk ', 'fridge') $$,
  '23505', null,
  'the same product twice in one place is one row (matched on the English name)'
);
select lives_ok(
  $$ insert into public.pantry_items (user_id, name, place) values
     ('10000000-0000-4000-8000-0000000fa001', 'Milk', 'freezer') $$,
  'the same product can be in another place'
);
select throws_ok(
  $$ insert into public.pantry_items (user_id, name, place) values
     ('10000000-0000-4000-8000-0000000fa002', 'eggs', 'fridge') $$,
  '42501', null,
  'nobody adds to another person''s pantry'
);
select throws_ok(
  $$ insert into public.pantry_items (user_id, name, place) values
     ('10000000-0000-4000-8000-0000000fa001', 'eggs', 'garage') $$,
  '23514', null,
  'only the four places'
);
select throws_ok(
  $$ insert into public.pantry_items (user_id, name, place) values
     ('10000000-0000-4000-8000-0000000fa001', '   ', 'fridge') $$,
  '23514', null,
  'a blank name is refused'
);
select is(
  (select array_agg(name_key order by place) from public.pantry_items),
  array['milk', 'milk'],
  'a person sees their own items, keyed by the English name'
);
select throws_ok(
  $$ insert into public.pantry_scan_photos (user_id, scan_id, place, quality) values
     ('10000000-0000-4000-8000-0000000fa001', gen_random_uuid(), 'fridge', 'ok') $$,
  '42501', null,
  'clients can''t write scan photos: only a scan can'
);
select is(
  (select count(*)::int from public.pantry_scan_photos),
  2,
  'a person reads their own scan photos only'
);
delete from public.pantry_scan_photos where scan_id = '20000000-0000-4000-8000-0000000fa001';
select throws_ok(
  $$ select count(*) from public.photo_handoffs $$,
  '42501', null,
  'clients can''t read handoffs'
);

-- Person B, signed in ---------------------------------------------------------
set local request.jwt.claims = '{"role":"authenticated","sub":"10000000-0000-4000-8000-0000000fa002"}';
select is((select count(*)::int from public.pantry_items), 0, 'another person sees none of it');
update public.pantry_items set name = 'hacked';
delete from public.pantry_items;
reset role;

select is(
  (select array_agg(name order by place) from public.pantry_items
   where user_id = '10000000-0000-4000-8000-0000000fa001'),
  array['Milk', 'חלב'],
  'and can''t change or delete it'
);
select is(
  (select count(*)::int from public.pantry_scan_photos where user_id = '10000000-0000-4000-8000-0000000fa001'),
  1,
  'a person clears their own scan photos'
);

-- Daily cap -------------------------------------------------------------------
select is(
  public.reserve_daily_ai_usage('10000000-0000-4000-8000-0000000fa001', 'pantry_scan', current_date, 2),
  1,
  'pantry scans have a daily cap'
);

-- Purge -----------------------------------------------------------------------
select public.purge_pantry_scratch();
select is(
  (select array_agg(row(token_hash, photo is not null)::text order by token_hash) from public.photo_handoffs
   where user_id = '10000000-0000-4000-8000-0000000fa001'),
  array[row('hash-fresh', true)::text, row('hash-pantry', false)::text, row('hash-stale', false)::text],
  'a phone photo goes after 15 minutes, and a handoff a day after it expired'
);
select is(
  (select count(*)::int from public.pantry_scan_photos where user_id = '10000000-0000-4000-8000-0000000fa001'),
  0,
  'an abandoned scan goes after a week'
);

-- Rescan reminder --------------------------------------------------------------
select is(
  (select count(*)::int from public.pantry_rescan_candidates(200, now() + interval '15 days')
   where user_id = '10000000-0000-4000-8000-0000000fa001'),
  1,
  'two weeks after the last scan, the rescan reminder is due'
);
select is(
  (select count(*)::int from public.pantry_rescan_candidates(200, now() + interval '3 days')
   where user_id = '10000000-0000-4000-8000-0000000fa001')
  + (select count(*)::int from public.pantry_rescan_candidates(200, now() + interval '60 days')
     where user_id = '10000000-0000-4000-8000-0000000fa001'),
  0,
  'not before two weeks, and not once the pantry has been left for over 45 days'
);
insert into public.nudge_sends (user_id, kind, channel)
values ('10000000-0000-4000-8000-0000000fa001', 'pantry_rescan', 'email');
select is(
  (select count(*)::int from public.pantry_rescan_candidates(200, now() + interval '15 days')
   where user_id = '10000000-0000-4000-8000-0000000fa001'),
  0,
  'it goes out once (no phone registered, email sent)'
);
update public.pantry_items set last_seen_at = now()
where user_id = '10000000-0000-4000-8000-0000000fa001' and source = 'scan';
select is(
  (select count(*)::int from public.nudge_sends
   where user_id = '10000000-0000-4000-8000-0000000fa001' and kind = 'pantry_rescan'),
  0,
  'scanning again starts the clock over, so the next stale spell gets a reminder too'
);

select ok(
  not has_function_privilege('authenticated', 'public.pantry_rescan_candidates(int, timestamptz)', 'execute')
  and has_function_privilege('service_role', 'public.pantry_rescan_candidates(int, timestamptz)', 'execute')
  and not has_function_privilege('authenticated', 'public.purge_pantry_scratch()', 'execute')
  and not has_function_privilege('anon', 'public.purge_pantry_scratch()', 'execute')
  and not has_table_privilege('anon', 'public.pantry_items', 'select'),
  'guests and clients can''t run the purge or read pantries'
);

select * from finish();
rollback;
