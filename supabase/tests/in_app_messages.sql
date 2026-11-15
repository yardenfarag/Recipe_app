begin;

create extension if not exists pgtap with schema extensions;
select * from no_plan();

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-4000-8000-0000000000a1',
   'authenticated', 'authenticated', 'msg-free@pinch.invalid', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-4000-8000-0000000000a2',
   'authenticated', 'authenticated', 'msg-pro@pinch.invalid', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-4000-8000-0000000000a3',
   'authenticated', 'authenticated', 'msg-admin@pinch.invalid', '', now(), '{}', '{}', now(), now());

update public.profiles set is_admin = true where id = '10000000-0000-4000-8000-0000000000a3';
update public.profiles set subscription_status = 'active' where id = '10000000-0000-4000-8000-0000000000a2';

create table pg_temp.ids (k text primary key, id uuid);
grant all on pg_temp.ids to authenticated, anon;

create function pg_temp.msg(extra jsonb) returns jsonb language sql as $$
  select '{"name":"t","presentation":"alert","content":{"en":{"title":"Hi","body":"B","primaryLabel":"Go"}}}'::jsonb || extra
$$;
grant execute on function pg_temp.msg(jsonb) to authenticated, anon;

-- App versions ---------------------------------------------------------------
select is(public.compare_app_versions('1.0.10', '1.0.9'), 1, '1.0.10 is above 1.0.9');
select is(public.compare_app_versions('1.0.9', '1.0.10'), -1, '1.0.9 is below 1.0.10');
select is(public.compare_app_versions('1.0.9-dev', '1.0.9'), 0, 'a -dev suffix is ignored');
select is(public.compare_app_versions('2', '2.0.0'), 0, 'missing parts count as 0');
select is(public.compare_app_versions('abc', '1.0'), null, 'an unreadable version compares to nothing');

-- Signed-out and non-admin callers ---------------------------------------------
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

select throws_ok(
  $$ select * from public.get_in_app_messages('ios', '1.0.9', 'en') $$,
  '42501', null, 'signed-out callers cannot fetch messages'
);
select throws_ok(
  $$ select count(*) from public.in_app_messages $$,
  '42501', null, 'signed-out callers cannot read the table'
);
select throws_ok(
  $$ select public.record_in_app_message_event(gen_random_uuid(), 'seen') $$,
  '42501', null, 'signed-out callers cannot record events'
);

reset role;
set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated","sub":"10000000-0000-4000-8000-0000000000a1"}';

select throws_ok(
  $$ select count(*) from public.in_app_messages $$,
  '42501', null, 'users cannot read the messages table'
);
select throws_ok(
  $$ select count(*) from public.in_app_message_receipts $$,
  '42501', null, 'users cannot read receipts'
);
select throws_ok(
  $$ insert into public.in_app_messages (name, presentation, content)
     values ('x', 'alert', '{"en":{"title":"t","body":""}}') $$,
  '42501', null, 'users cannot write messages'
);
select throws_ok(
  $$ select * from public.admin_list_in_app_messages() $$,
  '42501', null, 'non-admins cannot list messages with counts'
);
select throws_ok(
  $$ select public.admin_save_in_app_message(pg_temp.msg('{}')) $$,
  '42501', null, 'non-admins cannot save a message'
);
select throws_ok(
  $$ select public.admin_set_in_app_message_status(gen_random_uuid(), 'live') $$,
  '42501', null, 'non-admins cannot change a status'
);
select throws_ok(
  $$ select public.admin_delete_in_app_message(gen_random_uuid()) $$,
  '42501', null, 'non-admins cannot delete a message'
);
select throws_ok(
  $$ select * from public.get_in_app_messages('desktop', '1.0.9', 'en') $$,
  '22023', null, 'an unknown platform is rejected'
);

-- Admin writes -----------------------------------------------------------------
reset role;
set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated","sub":"10000000-0000-4000-8000-0000000000a3"}';

insert into pg_temp.ids select 'one_user', public.admin_save_in_app_message(pg_temp.msg(
  '{"name":"one user","targeting":{"userIds":["10000000-0000-4000-8000-0000000000a1"]}}'));
insert into pg_temp.ids select 'everyone', public.admin_save_in_app_message(pg_temp.msg(
  '{"name":"everyone","frequency":{"type":"until_dismissed"},"priority":1}'));
insert into pg_temp.ids select 'below', public.admin_save_in_app_message(pg_temp.msg(
  '{"name":"below 1.0.10","presentation":"banner","bannerPosition":"top","targeting":{"maxAppVersion":"1.0.10"},
    "required":true,"dismissible":false,"primaryAction":{"type":"store"}}'));
insert into pg_temp.ids select 'web_only', public.admin_save_in_app_message(pg_temp.msg(
  '{"name":"web only","targeting":{"platforms":["web"]}}'));
insert into pg_temp.ids select 'pro_only', public.admin_save_in_app_message(pg_temp.msg(
  '{"name":"pro only","targeting":{"plans":["pro"]}}'));
insert into pg_temp.ids select 'hebrew', public.admin_save_in_app_message(pg_temp.msg(
  '{"name":"hebrew users","content":{"en":{"title":"Hi","body":"B"},"he":{"title":"שלום","body":"ג"}},"targeting":{"languages":["he"]}}'));
insert into pg_temp.ids select 'future', public.admin_save_in_app_message(pg_temp.msg(
  jsonb_build_object('name', 'future', 'startsAt', now() + interval '1 day')));
insert into pg_temp.ids select 'past', public.admin_save_in_app_message(pg_temp.msg(
  jsonb_build_object('name', 'past', 'startsAt', now() - interval '2 days', 'endsAt', now() - interval '1 day')));
insert into pg_temp.ids select 'limited', public.admin_save_in_app_message(pg_temp.msg(
  '{"name":"limited","frequency":{"type":"every_launch"},"maxShows":2,"priority":-5}'));

select is(
  (select status from public.admin_list_in_app_messages((select id from pg_temp.ids where k = 'one_user'))),
  'draft', 'a new message is a draft'
);
select is(
  (select targeting->'userIds' from public.admin_list_in_app_messages((select id from pg_temp.ids where k = 'one_user'))),
  '["10000000-0000-4000-8000-0000000000a1"]'::jsonb, 'targeting is stored as sent'
);

-- Bad input is refused by the table's checks.
select throws_ok(
  $$ select public.admin_save_in_app_message(pg_temp.msg('{"content":{"he":{"title":"x","body":""}}}')) $$,
  '23514', null, 'English content is required'
);
select throws_ok(
  $$ select public.admin_save_in_app_message(pg_temp.msg('{"primaryAction":{"type":"link","url":"javascript:alert(1)"}}')) $$,
  '23514', null, 'a link action must be https'
);
select throws_ok(
  $$ select public.admin_save_in_app_message(pg_temp.msg('{"primaryAction":{"type":"route","href":"//evil.example"}}')) $$,
  '23514', null, 'a route must not be protocol-relative'
);
select throws_ok(
  $$ select public.admin_save_in_app_message(pg_temp.msg('{"frequency":{"type":"every_n_days","days":0}}')) $$,
  '23514', null, 'every N days needs N of at least 1'
);
select throws_ok(
  $$ select public.admin_save_in_app_message(pg_temp.msg('{"targeting":{"plans":["gold"]}}')) $$,
  '23514', null, 'an unknown plan is refused'
);
select throws_ok(
  $$ select public.admin_save_in_app_message(pg_temp.msg('{"targeting":{"nope":1}}')) $$,
  '23514', null, 'an unknown targeting key is refused'
);
select throws_ok(
  $$ select public.admin_save_in_app_message(pg_temp.msg('{"targeting":{"userIds":["not-a-uuid"]}}')) $$,
  '23514', null, 'a user id must be a uuid'
);
select throws_ok(
  $$ select public.admin_save_in_app_message(pg_temp.msg('{"content":{"en":{"title":"","body":""}}}')) $$,
  '23514', null, 'a title cannot be empty'
);
select throws_ok(
  $$ select public.admin_save_in_app_message(pg_temp.msg(
       jsonb_build_object('startsAt', now() + interval '2 days', 'endsAt', now() + interval '1 day'))) $$,
  '23514', null, 'the end must come after the start'
);
select throws_ok(
  $$ select public.admin_save_in_app_message(pg_temp.msg('{"id":"00000000-0000-4000-8000-000000000000"}')) $$,
  'P0002', null, 'updating a message that does not exist fails'
);
select throws_ok(
  $$ select public.admin_set_in_app_message_status((select id from pg_temp.ids where k = 'everyone'), 'ended') $$,
  '22023', null, 'ended is not a status an admin sets'
);

-- Publish everything except the one kept as a draft.
select public.admin_set_in_app_message_status(id, 'live')
from pg_temp.ids where k <> 'web_only';
select public.admin_set_in_app_message_status((select id from pg_temp.ids where k = 'web_only'), 'draft');

select is(
  (select status from public.admin_list_in_app_messages((select id from pg_temp.ids where k = 'future'))),
  'scheduled', 'a live message that starts later reads as scheduled'
);
select is(
  (select status from public.admin_list_in_app_messages((select id from pg_temp.ids where k = 'past'))),
  'ended', 'a live message past its end reads as ended'
);

-- A user sees what targets them -------------------------------------------------
reset role;
set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated","sub":"10000000-0000-4000-8000-0000000000a1"}';

select is(
  (select array_agg(i.k order by i.k)
   from public.get_in_app_messages('ios', '1.0.9', 'en') g join pg_temp.ids i on i.id = g.id),
  array['below', 'everyone', 'limited', 'one_user'],
  'the targeted user sees their own message, everyone messages and the version message; not drafts, future, ended, pro or Hebrew ones'
);

set local request.jwt.claims = '{"role":"authenticated","sub":"10000000-0000-4000-8000-0000000000a2"}';

select is(
  (select array_agg(i.k order by i.k)
   from public.get_in_app_messages('ios', '1.0.9', 'en') g join pg_temp.ids i on i.id = g.id),
  array['below', 'everyone', 'limited', 'pro_only'],
  'a pro user does not see the other user''s message, and does see the pro one'
);

select is(
  (select array_agg(i.k order by i.k)
   from public.get_in_app_messages('ios', '1.0.10', 'en') g join pg_temp.ids i on i.id = g.id),
  array['everyone', 'limited', 'pro_only'],
  'version 1.0.10 is not below 1.0.10'
);
select is(
  (select count(*)::int
   from public.get_in_app_messages('ios', '1.0.10-dev', 'en') g join pg_temp.ids i on i.id = g.id and i.k = 'below'),
  0, 'a -dev build of 1.0.10 is not below 1.0.10'
);
select is(
  (select count(*)::int
   from public.get_in_app_messages('ios', '1.0.2', 'en') g join pg_temp.ids i on i.id = g.id and i.k = 'below'),
  1, 'version 1.0.2 is below 1.0.10'
);
select is(
  (select count(*)::int
   from public.get_in_app_messages('ios', null, 'en') g join pg_temp.ids i on i.id = g.id and i.k = 'below'),
  0, 'an unknown version never matches a version bound'
);
select is(
  (select array_agg(i.k order by i.k)
   from public.get_in_app_messages('ios', '1.0.9', 'he-IL') g join pg_temp.ids i on i.id = g.id),
  array['below', 'everyone', 'hebrew', 'limited', 'pro_only'],
  'language targeting reads he-IL as he'
);

-- Order: priority first.
select is(
  (select i.k from public.get_in_app_messages('ios', '1.0.9', 'en') g join pg_temp.ids i on i.id = g.id limit 1),
  'everyone', 'higher priority comes first'
);

-- The web-only message is a draft, so it shows nowhere yet; publish it.
reset role;
set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated","sub":"10000000-0000-4000-8000-0000000000a3"}';
select public.admin_set_in_app_message_status((select id from pg_temp.ids where k = 'web_only'), 'live');

set local request.jwt.claims = '{"role":"authenticated","sub":"10000000-0000-4000-8000-0000000000a1"}';
select is(
  (select count(*)::int from public.get_in_app_messages('web', '1.0.9', 'en') g join pg_temp.ids i on i.id = g.id and i.k = 'web_only'),
  1, 'a web-only message shows on web'
);
select is(
  (select count(*)::int from public.get_in_app_messages('ios', '1.0.9', 'en') g join pg_temp.ids i on i.id = g.id and i.k = 'web_only'),
  0, 'a web-only message does not show on iOS'
);
select is(
  (select count(*)::int from public.get_in_app_messages('android', '1.0.9', 'en') g join pg_temp.ids i on i.id = g.id and i.k = 'web_only'),
  0, 'a web-only message does not show on Android'
);

-- Receipts -----------------------------------------------------------------------
select throws_ok(
  $$ select public.record_in_app_message_event(gen_random_uuid(), 'seen') $$,
  'P0002', null, 'an unknown message cannot be recorded'
);
select throws_ok(
  $$ select public.record_in_app_message_event((select id from pg_temp.ids where k = 'everyone'), 'bogus') $$,
  '22023', null, 'an unknown event is rejected'
);
select throws_ok(
  $$ select public.record_in_app_message_event((select id from pg_temp.ids where k = 'everyone'), 'clicked', 'third') $$,
  '22023', null, 'a tap needs a known button'
);

select public.record_in_app_message_event((select id from pg_temp.ids where k = 'one_user'), 'seen');
select public.record_in_app_message_event((select id from pg_temp.ids where k = 'everyone'), 'seen');
select public.record_in_app_message_event((select id from pg_temp.ids where k = 'everyone'), 'seen');
select public.record_in_app_message_event((select id from pg_temp.ids where k = 'everyone'), 'dismissed');
select public.record_in_app_message_event((select id from pg_temp.ids where k = 'below'), 'seen');
select public.record_in_app_message_event((select id from pg_temp.ids where k = 'below'), 'clicked', 'primary');
select public.record_in_app_message_event((select id from pg_temp.ids where k = 'limited'), 'seen');
select public.record_in_app_message_event((select id from pg_temp.ids where k = 'limited'), 'seen');

select is(
  (select seen_count from public.get_in_app_messages('ios', '1.0.9', 'en') g join pg_temp.ids i on i.id = g.id and i.k = 'below'),
  1, 'a required message stays after it was seen, with its receipt beside it'
);
select is(
  (select clicked_button from public.get_in_app_messages('ios', '1.0.9', 'en') g join pg_temp.ids i on i.id = g.id and i.k = 'below'),
  'primary', 'the tapped button is returned'
);
select is(
  (select array_agg(i.k order by i.k)
   from public.get_in_app_messages('ios', '1.0.9', 'en') g join pg_temp.ids i on i.id = g.id),
  array['below'],
  'a once message already seen, an until-dismissed one dismissed and one at max shows are all left out'
);

-- Other users are unaffected; the receipt belongs to the JWT user.
set local request.jwt.claims = '{"role":"authenticated","sub":"10000000-0000-4000-8000-0000000000a2"}';
select is(
  (select count(*)::int from public.get_in_app_messages('ios', '1.0.9', 'en') g join pg_temp.ids i on i.id = g.id and i.k = 'everyone'),
  1, 'another user still sees a message the first user dismissed'
);
select public.record_in_app_message_event((select id from pg_temp.ids where k = 'everyone'), 'seen');

-- Admin counts ---------------------------------------------------------------------
set local request.jwt.claims = '{"role":"authenticated","sub":"10000000-0000-4000-8000-0000000000a3"}';
select is(
  (select array[seen_count, dismissed_count, clicked_count]
   from public.admin_list_in_app_messages((select id from pg_temp.ids where k = 'everyone'))),
  array[2, 1, 0], 'counts: two users saw it, one dismissed, none tapped'
);
select is(
  (select array[seen_count, dismissed_count, clicked_count]
   from public.admin_list_in_app_messages((select id from pg_temp.ids where k = 'below'))),
  array[1, 0, 1], 'counts: one saw it and tapped a button'
);

-- Stopping --------------------------------------------------------------------------
select public.admin_set_in_app_message_status((select id from pg_temp.ids where k = 'below'), 'stopped');
set local request.jwt.claims = '{"role":"authenticated","sub":"10000000-0000-4000-8000-0000000000a1"}';
select is(
  (select count(*)::int from public.get_in_app_messages('ios', '1.0.9', 'en') g join pg_temp.ids i on i.id = g.id and i.k = 'below'),
  0, 'a stopped message disappears at the next fetch'
);

-- Erased with the account -----------------------------------------------------------
reset role;
select is(
  (select count(*)::int from public.in_app_message_receipts where user_id = '10000000-0000-4000-8000-0000000000a2'),
  1, 'the second user has a receipt'
);
delete from auth.users where id = '10000000-0000-4000-8000-0000000000a2';
select is(
  (select count(*)::int from public.in_app_message_receipts where user_id = '10000000-0000-4000-8000-0000000000a2'),
  0, 'deleting the account erases its receipts'
);

-- Deleting a message ----------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated","sub":"10000000-0000-4000-8000-0000000000a3"}';
select public.admin_delete_in_app_message((select id from pg_temp.ids where k = 'everyone'));
reset role;
select is(
  (select count(*)::int from public.in_app_message_receipts r
   where r.message_id = (select id from pg_temp.ids where k = 'everyone')),
  0, 'deleting a message deletes its receipts'
);

-- Images --------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated","sub":"10000000-0000-4000-8000-0000000000a3"}';
select lives_ok(
  $$ insert into storage.objects (bucket_id, name, owner)
     values ('recipe-thumbnails', 'in-app-messages/test.png', '10000000-0000-4000-8000-0000000000a3') $$,
  'an admin can add an image under in-app-messages/'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner)
     values ('recipe-thumbnails', 'photo/not-allowed.png', '10000000-0000-4000-8000-0000000000a3') $$,
  '42501', null, 'an admin still cannot write elsewhere in the bucket'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner)
     values ('avatars', 'in-app-messages/test.png', '10000000-0000-4000-8000-0000000000a3') $$,
  '42501', null, 'the folder rule is for recipe-thumbnails only'
);

set local request.jwt.claims = '{"role":"authenticated","sub":"10000000-0000-4000-8000-0000000000a1"}';
select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner)
     values ('recipe-thumbnails', 'in-app-messages/user.png', '10000000-0000-4000-8000-0000000000a1') $$,
  '42501', null, 'a non-admin cannot add an image there'
);
select is(
  (select count(*)::int from storage.objects where bucket_id = 'recipe-thumbnails' and name like 'in-app-messages/%'),
  0, 'nobody can list the folder'
);

select * from finish();
rollback;
