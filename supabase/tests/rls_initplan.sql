-- 20261122233000_faster_admin_dashboard_and_rls: policies evaluate auth.uid()
-- once per query, and the admin dashboards still check the timezone.
begin;

create extension if not exists pgtap with schema extensions;
select plan(7);

-- A bare auth.uid() in a policy runs once per row. Write (select auth.uid()).
select is(
  (
    select coalesce(string_agg(tablename || '.' || policyname, ', '), '')
    from pg_policies
    where schemaname = 'public'
      and (
        replace(coalesce(qual, ''), '( SELECT auth.uid() AS uid)', '') ~ 'auth\.uid\(\)'
        or replace(coalesce(with_check, ''), '( SELECT auth.uid() AS uid)', '') ~ 'auth\.uid\(\)'
      )
  ),
  '',
  'no public policy calls auth.uid() without a select around it'
);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-4000-8000-0000000000c1',
   'authenticated', 'authenticated', 'initplan-user@pinch.invalid', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-4000-8000-0000000000c2',
   'authenticated', 'authenticated', 'initplan-other@pinch.invalid', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-4000-8000-0000000000c9',
   'authenticated', 'authenticated', 'initplan-admin@pinch.invalid', '', now(), '{}', '{}', now(), now());

update public.profiles set is_admin = true where id = '10000000-0000-4000-8000-0000000000c9';

insert into public.recipes (user_id, title, ingredients, instructions)
values
  ('10000000-0000-4000-8000-0000000000c1', 'Mine',
   '[{"name":"egg","quantity":1,"unit":""}]', '[{"step":1,"text":"Boil"}]'),
  ('10000000-0000-4000-8000-0000000000c2', 'Theirs',
   '[{"name":"egg","quantity":1,"unit":""}]', '[{"step":1,"text":"Boil"}]');

set local role authenticated;

-- The rewritten policies still keep people to their own rows.
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-0000000000c1","role":"authenticated"}';
select results_eq(
  $$select title from public.recipes where user_id in
    ('10000000-0000-4000-8000-0000000000c1', '10000000-0000-4000-8000-0000000000c2')$$,
  $$values ('Mine'::text)$$,
  'a person reads only their own recipes'
);
select throws_ok(
  $$insert into public.recipes (user_id, title) values ('10000000-0000-4000-8000-0000000000c2', 'Planted')$$,
  '42501',
  null,
  'a person cannot save a recipe as someone else'
);

-- The timezone check: a real zone is kept, anything else falls back to UTC.
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-0000000000c9","role":"authenticated"}';
select is(public.admin_dashboard(7, 'Asia/Jerusalem', false)->'range'->>'tz', 'Asia/Jerusalem',
  'admin_dashboard keeps a real timezone');
select is(public.admin_dashboard(7, 'Not/AZone', false)->'range'->>'tz', 'UTC',
  'admin_dashboard falls back to UTC for an unknown timezone');
select is(public.admin_dashboard_insights(7, 'Asia/Jerusalem', false)->'range'->>'tz', 'Asia/Jerusalem',
  'admin_dashboard_insights keeps a real timezone');
select is(public.admin_dashboard_insights(7, 'Not/AZone', false)->'range'->>'tz', 'UTC',
  'admin_dashboard_insights falls back to UTC for an unknown timezone');

select * from finish();
rollback;
