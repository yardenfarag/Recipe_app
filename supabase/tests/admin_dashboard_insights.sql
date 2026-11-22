-- admin_dashboard_insights (PIN-49): per-platform extraction, Jev gate outcomes,
-- translations and latency for the admin dashboard's hints. Admins only.
begin;

create extension if not exists pgtap with schema extensions;
select plan(14);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-4000-8000-0000000000b1',
   'authenticated', 'authenticated', 'insights-user@pinch.invalid', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-4000-8000-0000000000b9',
   'authenticated', 'authenticated', 'insights-admin@pinch.invalid', '', now(), '{}', '{}', now(), now());

update public.profiles set is_admin = true where id = '10000000-0000-4000-8000-0000000000b9';

-- Start from an empty event table so the counts below are exact.
delete from public.ai_usage_events;

insert into public.ai_usage_events
  (user_id, action, status, platform, extraction_source, total_cost_usd, duration_ms, error_message, metadata, created_at)
values
  -- TikTok: 2 recipes (one from the video), 1 failure, 1 cache hit that must not count.
  ('10000000-0000-4000-8000-0000000000b1', 'extract', 'full', 'tiktok', 'description', 0.01, 1000, null,
   '{"extract_route":"full_recipe_in_text"}', now()),
  ('10000000-0000-4000-8000-0000000000b1', 'extract', 'partial', 'tiktok', 'video', 0.05, 9000, null,
   '{"extract_route":"full_recipe_in_text"}', now()),
  ('10000000-0000-4000-8000-0000000000b1', 'extract', 'failed', 'tiktok', null, 0.002, 500, 'extract_gate: no_recipe',
   '{"extract_route":"no_recipe"}', now()),
  ('10000000-0000-4000-8000-0000000000b1', 'extract', 'cached', 'tiktok', null, 0, 10, null, '{}', now()),
  -- Instagram: one failure.
  ('10000000-0000-4000-8000-0000000000b1', 'extract', 'error', 'instagram', null, 0.03, 4000, 'boom', '{}', now()),
  -- Gate decisions: two confident, one unsure, one error.
  ('10000000-0000-4000-8000-0000000000b1', 'extract_gate', 'full_recipe_in_text', 'tiktok', null, 0.0001, 300, null, '{}', now()),
  ('10000000-0000-4000-8000-0000000000b1', 'extract_gate', 'no_recipe', 'tiktok', null, 0.0001, 300, null, '{}', now()),
  ('10000000-0000-4000-8000-0000000000b1', 'extract_gate', 'low_confidence', 'tiktok', null, 0.0001, 300, null, '{}', now()),
  ('10000000-0000-4000-8000-0000000000b1', 'extract_gate', 'error', 'tiktok', null, 0, 300, 'timeout', '{}', now()),
  -- Translations: two now (one failed), one in the previous window.
  ('10000000-0000-4000-8000-0000000000b1', 'translate', 'ok', null, null, 0.004, 2000, null, '{"targetLanguage":"he"}', now()),
  ('10000000-0000-4000-8000-0000000000b1', 'translate', 'error', null, null, 0, 2000, 'x', '{"targetLanguage":"he"}', now()),
  ('10000000-0000-4000-8000-0000000000b1', 'translate', 'ok', null, null, 0.004, 2000, null, '{"targetLanguage":"fr"}',
   now() - interval '40 days'),
  -- An admin's extract is left out unless admins are included.
  ('10000000-0000-4000-8000-0000000000b9', 'extract', 'full', 'youtube', 'captions', 0.02, 1500, null, '{}', now());

-- Not an admin: refused.
set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-0000000000b1","role":"authenticated"}';
select throws_ok($$select public.admin_dashboard_insights(30, 'UTC', false)$$, 'forbidden', 'non-admins are refused');

set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-0000000000b9","role":"authenticated"}';

create temp table r on commit drop as select public.admin_dashboard_insights(30, 'UTC', false) as v;
create temp table tiktok on commit drop as
  select p from r, jsonb_array_elements(r.v->'extract_by_platform'->'current') p where p->>'platform' = 'tiktok';

select is((select (p->>'attempts')::int from tiktok), 3, 'attempts leave out cache hits');
select is((select (p->>'recipes')::int from tiktok), 2, 'recipes count full and partial');
select is((select (p->>'failed')::int from tiktok), 1, 'failures per platform');
select is((select (p->>'video')::int from tiktok), 1, 'recipes that needed the video');
select is((select (p->>'p95_ms')::int from tiktok), 9000, 'p95 time per platform');
select is(
  (select count(*)::int from r, jsonb_array_elements(r.v->'extract_by_platform'->'current') p where p->>'platform' = 'youtube'),
  0, 'admin extracts are left out by default');
select is(
  (select count(*)::int from jsonb_array_elements(public.admin_dashboard_insights(30, 'UTC', true)->'extract_by_platform'->'current') p
   where p->>'platform' = 'youtube'),
  1, 'admin extracts are counted when asked for');

select is((select r.v->'gate'->'current'->>'decisions' from r)::int, 4, 'every gate decision is counted');
select is((select r.v->'gate'->'current'->>'confident' from r)::int, 2, 'confident decisions leave out unsure ones and errors');
select is(
  (select x from r, jsonb_array_elements(r.v->'gate'->'current'->'routes') x where x->>'route' = 'full_recipe_in_text'),
  '{"route":"full_recipe_in_text","extracts":2,"recipes":2,"video":1,"failed":0,"blocked":0}'::jsonb,
  'what happened to extracts the gate sent to the text step');
select is(
  (select (x->>'blocked')::int from r, jsonb_array_elements(r.v->'gate'->'current'->'routes') x where x->>'route' = 'no_recipe'),
  1, 'posts the gate stopped as not a recipe');

select is(
  (select (r.v->'translations'->'current') - 'languages'::text from r),
  '{"calls":2,"ok":1,"failed":1,"cost_usd":0.004,"people":1}'::jsonb,
  'translation volume in the current window');
select is((select r.v->'translations'->'previous'->>'calls' from r)::int, 1, 'translation volume in the previous window');

select * from finish();
rollback;
