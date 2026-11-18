-- admin_dashboard ties each person to their pre-sign-up "heard about" answer
-- and first website visit, through the install id they used as a guest.
begin;

create extension if not exists pgtap with schema extensions;
select plan(8);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-4000-8000-0000000000a1',
   'authenticated', 'authenticated', 'session-link@pinch.invalid', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-4000-8000-0000000000a2',
   'authenticated', 'authenticated', 'event-link@pinch.invalid', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-4000-8000-0000000000a3',
   'authenticated', 'authenticated', 'unlinked@pinch.invalid', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-4000-8000-0000000000a9',
   'authenticated', 'authenticated', 'source-admin@pinch.invalid', '', now(), '{}', '{}', now(), now());

update public.profiles set is_admin = true where id = '10000000-0000-4000-8000-0000000000a9';

-- Person 1: visited from ChatGPT, answered as a guest, then signed in during the same app session.
insert into public.product_events (guest_install_id, name, properties, created_at) values
  ('install-src-1', 'web_intro_viewed', '{"page":"intro","utm_source":"chatgpt.com"}', now() - interval '2 hours'),
  ('install-src-1', 'web_intro_viewed', '{"page":"intro","ref":"google.com"}', now() - interval '1 hour'),
  ('install-src-1', 'heard_about', '{"source":"ai_assistant","platform":"web"}', now() - interval '50 minutes');
insert into public.interaction_events (user_id, guest_install_id, session_id, kind, name, platform, occurred_at) values
  (null, 'install-src-1', '30000000-0000-4000-8000-000000000001', 'tap', 'onboarding.heard.ai_assistant', 'web', now()),
  ('10000000-0000-4000-8000-0000000000a1', null, '30000000-0000-4000-8000-000000000001', 'screen', '/add', 'web', now());

-- Person 2: answered as a guest; a later signed-in event carries the same install id.
insert into public.product_events (user_id, guest_install_id, name, properties) values
  (null, 'install-src-2', 'heard_about', '{"source":"tiktok_instagram","platform":"ios"}'),
  ('10000000-0000-4000-8000-0000000000a2', 'install-src-2', 'onboarding_completed', '{"locale":"en","platform":"ios"}');

-- Someone else's answer on another install must not attach to person 3.
insert into public.product_events (guest_install_id, name, properties) values
  ('install-src-other', 'heard_about', '{"source":"friend","platform":"ios"}');

set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-0000000000a9","role":"authenticated"}';

create temp table people on commit drop as
select p->>'email' as email, p->>'heard_about' as heard_about, p->>'web_source' as web_source,
       p ? 'web_source' as has_web_key
from jsonb_array_elements(public.admin_dashboard(30, 'UTC', false)->'people') p;

select is((select heard_about from people where email = 'session-link@pinch.invalid'), 'ai_assistant',
  'a guest answer is linked through a shared app session');
select is((select web_source from people where email = 'session-link@pinch.invalid'), 'chatgpt.com',
  'the first website visit is the one reported');
select is((select heard_about from people where email = 'event-link@pinch.invalid'), 'tiktok_instagram',
  'a guest answer is linked through a signed-in event carrying the install id');
select is((select web_source from people where email = 'event-link@pinch.invalid'), null,
  'no website visit means no web source');
select is((select heard_about from people where email = 'unlinked@pinch.invalid'), null,
  'unlinked people get no answer');
select ok((select has_web_key from people where email = 'unlinked@pinch.invalid'),
  'the field is present even when empty');

select is(
  (public.admin_dashboard(30, 'UTC', false)->'kpis'->'current'->>'active_guests')::int,
  (select count(distinct guest_install_id)::int from public.product_events where user_id is null),
  'signed-in events with an install id are not counted as guests'
);

set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-0000000000a1","role":"authenticated"}';
select throws_ok($$ select public.admin_dashboard() $$, 'P0001', 'forbidden', 'non-admins are refused');

select * from finish();
rollback;
