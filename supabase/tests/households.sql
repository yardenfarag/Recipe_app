begin;

create extension if not exists pgtap with schema extensions;
select plan(90);

-- Households (migration 20261126130000_households, ADR 034).
--   Ann (A) sets up "Flat 3" and invites. Ben (B) joins from a household of one: his list, pantry and staples
--   move in. Cat (C) is a stranger. Dov (D) lives with Eli (E) and joins Flat 3 alone, leaving Eli his rows.
--   Fillers F1..F6 fill Flat 3 to 8. Gil (G) deletes his account.

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
select '00000000-0000-0000-0000-000000000000', v.id::uuid, 'authenticated', 'authenticated', v.email, '',
       now(), '{}', jsonb_build_object('locale', v.locale), now(), now()
from (values
  ('10000000-0000-4000-8000-00000000d001', 'hh-ann@pinch.invalid', 'en'),
  ('10000000-0000-4000-8000-00000000d002', 'hh-ben@pinch.invalid', 'he'),
  ('10000000-0000-4000-8000-00000000d003', 'hh-cat@pinch.invalid', 'en'),
  ('10000000-0000-4000-8000-00000000d004', 'hh-dov@pinch.invalid', 'ru'),
  ('10000000-0000-4000-8000-00000000d005', 'hh-eli@pinch.invalid', 'ar'),
  ('10000000-0000-4000-8000-00000000d011', 'hh-f1@pinch.invalid', 'en'),
  ('10000000-0000-4000-8000-00000000d012', 'hh-f2@pinch.invalid', 'en'),
  ('10000000-0000-4000-8000-00000000d013', 'hh-f3@pinch.invalid', 'en'),
  ('10000000-0000-4000-8000-00000000d014', 'hh-f4@pinch.invalid', 'en'),
  ('10000000-0000-4000-8000-00000000d015', 'hh-f5@pinch.invalid', 'en'),
  ('10000000-0000-4000-8000-00000000d016', 'hh-f6@pinch.invalid', 'en'),
  ('10000000-0000-4000-8000-00000000d020', 'hh-gil@pinch.invalid', 'es')
) as v(id, email, locale);

-- Phones, so the push recipients aren't empty.
insert into public.push_tokens (token, user_id, platform)
select 'ExponentPushToken[hh' || right(id::text, 4) || ']', id, 'ios'
from auth.users where email like 'hh-%@pinch.invalid';

-- Test helpers: whose household, and how many rows a write touched (both as the caller).
create function pg_temp.household_of(p_user uuid) returns uuid
language sql security definer set search_path = '' as $$
  select m.household_id from public.household_members m where m.user_id = p_user;
$$;
grant execute on function pg_temp.household_of(uuid) to anon, authenticated;

create function pg_temp.affected(q text) returns int
language plpgsql as $$
declare
  n int;
begin
  execute q;
  get diagnostics n = row_count;
  return n;
end;
$$;
grant execute on function pg_temp.affected(text) to anon, authenticated;

-- ── Everyone has a household ───────────────────────────────────────────────
select is(
  (select count(*)::int from public.profiles p
   where (select count(*) from public.household_members m where m.user_id = p.id) <> 1),
  0,
  'every profile is in exactly one household (backfill and the new-profile trigger)'
);
select ok(
  (select h.set_up_at is null and h.name is null and h.staples = '{}'
          and (select count(*) from public.household_members m where m.household_id = h.id) = 1
          and (select display_name from public.household_members where user_id = '10000000-0000-4000-8000-00000000d001') = ''
   from public.households h where h.id = pg_temp.household_of('10000000-0000-4000-8000-00000000d001')),
  'a new account gets a household of one, not set up, with no name'
);
select is(
  public.clean_household_staples(array[' salt ', 'Salt', '', null, 'olive   oil', repeat('x', 70)]),
  array['salt', 'olive oil', repeat('x', 60)],
  '"Always have" is trimmed, deduplicated ignoring case and cut to 60 characters'
);
select is(
  cardinality(public.clean_household_staples(array(select 'item ' || g from generate_series(1, 50) g))),
  40,
  'and capped at 40'
);

-- Ben and Eli bring rows of their own; Dov lives with Eli.
update public.households set staples = array['Salt', 'pepper']
where id = pg_temp.household_of('10000000-0000-4000-8000-00000000d002');
insert into public.pantry_items (user_id, name, name_en, place, source, last_seen_at)
values ('10000000-0000-4000-8000-00000000d002', 'חלב', 'milk', 'fridge', 'scan', now()),
       ('10000000-0000-4000-8000-00000000d002', 'Eggs', 'eggs', 'fridge', 'manual', now());
insert into public.shopping_list_items (user_id, name) values ('10000000-0000-4000-8000-00000000d002', 'bread');
update public.households set name = 'Eli and Dov', avatar = 'house:tent', set_up_at = now()
where id = pg_temp.household_of('10000000-0000-4000-8000-00000000d005');
update public.household_members set household_id = pg_temp.household_of('10000000-0000-4000-8000-00000000d005'),
  display_name = 'Dov'
where user_id = '10000000-0000-4000-8000-00000000d004';
update public.household_members set display_name = 'Eli' where user_id = '10000000-0000-4000-8000-00000000d005';
insert into public.shopping_list_items (user_id, name) values ('10000000-0000-4000-8000-00000000d004', 'tea');

-- ── Ann sets up her household ─────────────────────────────────────────────
set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated","sub":"10000000-0000-4000-8000-00000000d001"}';

select ok(
  (select (h ->> 'is_set_up')::boolean = false and jsonb_array_length(h -> 'members') = 1
          and (h -> 'members' -> 0 ->> 'is_me')::boolean and h -> 'invite' = 'null'::jsonb
          and h ? 'going_shopping_sent_at' and h -> 'staples' = '[]'::jsonb
   from public.get_my_household() as h),
  'get_my_household: the shape the apps parse'
);
select throws_ok($$ select public.get_household_invite() $$, 'P0001', 'not_set_up',
  'no invite link before the household is set up');
select throws_ok($$ select public.update_household('Flat 3', 'house:home') $$, 'P0001', 'not_set_up',
  'no renaming before it is set up');
select throws_ok($$ select public.set_up_household('   ', 'house:home', 'Ann') $$, 'P0001', 'name_required',
  'set up needs a household name');
select throws_ok($$ select public.set_up_household('Flat 3', 'house:home', '') $$, 'P0001', 'name_required',
  'and my name');
select throws_ok($$ select public.set_up_household('Flat 3', 'https://x/y.png', 'Ann') $$, 'P0001', 'invalid_avatar',
  'and a house picture');
select ok(
  (select (h ->> 'is_set_up')::boolean and h ->> 'name' = 'Flat 3' and h ->> 'avatar' = 'house:home'
          and h -> 'members' -> 0 ->> 'display_name' = 'Ann'
   from public.set_up_household('  Flat   3 ', 'house:home', ' Ann ') as h),
  'set_up_household names it and me'
);
select is(
  public.set_household_staples(array['salt', 'olive oil', 'SALT', '  ']),
  array['salt', 'olive oil'],
  'set_household_staples saves a clean list and returns it'
);

-- The list and pantry, as old and new app builds write them.
insert into public.shopping_list_items (user_id, name) values ('10000000-0000-4000-8000-00000000d001', 'onions');
select is(
  (select household_id from public.shopping_list_items where name = 'onions'),
  pg_temp.household_of('10000000-0000-4000-8000-00000000d001'),
  'an insert without household_id (old app builds) lands in my household'
);
select is(
  public.migrate_guest_shopping_list('10000000-0000-4000-8000-00000000d001', '[{"name":"rice"}]'::jsonb),
  1,
  'migrate_guest_shopping_list still works'
);
select throws_ok(
  $$ insert into public.shopping_list_items (user_id, name) values ('10000000-0000-4000-8000-00000000d003', 'planted') $$,
  '42501', null,
  'nobody adds a line as someone else'
);
select throws_ok(
  format($$ insert into public.shopping_list_items (household_id, user_id, name) values (%L, %L, 'planted') $$,
         pg_temp.household_of('10000000-0000-4000-8000-00000000d003'), '10000000-0000-4000-8000-00000000d001'),
  '42501', null,
  'nobody adds to another household''s list'
);
insert into public.pantry_items (user_id, name, name_en, place, source, last_seen_at)
values ('10000000-0000-4000-8000-00000000d001', 'Milk', 'milk', 'fridge', 'scan', now() - interval '1 day');
select is(
  (select household_id from public.pantry_items where name = 'Milk'),
  pg_temp.household_of('10000000-0000-4000-8000-00000000d001'),
  'a pantry insert without household_id lands in my household'
);
-- What the apps' upsert sends (onConflict: household_id,place,name_key).
insert into public.pantry_items (user_id, name, name_en, place, source, last_seen_at)
values ('10000000-0000-4000-8000-00000000d001', 'Milk 3%', 'Milk', 'fridge', 'scan', now() - interval '1 day')
on conflict (household_id, place, name_key) do update set name = excluded.name, last_seen_at = excluded.last_seen_at;
select is(
  (select array_agg(name) from public.pantry_items),
  array['Milk 3%'],
  'the upsert finds the household''s row (household_id is filled before the conflict check)'
);

select ok(
  (select char_length(i ->> 'token') = 43 and (i ->> 'expires_at')::timestamptz > now() + interval '6 days 23 hours'
   from public.get_household_invite() as i),
  'get_household_invite makes a 7-day link'
);
select is(
  (select public.get_household_invite() ->> 'token'),
  (select public.get_my_household() -> 'invite' ->> 'token'),
  'asking again gives the same link, and get_my_household shows it'
);
create temp table first_invite as select public.get_household_invite() ->> 'token' as token;
grant select on first_invite to anon, authenticated;
select isnt(
  (select public.renew_household_invite() ->> 'token'),
  (select token from first_invite),
  'renew_household_invite makes a new link'
);
select is(
  (select public.preview_household_invite(token) ->> 'status' from first_invite),
  'already_member',
  'a member opening the link is told so'
);
create temp table live_invite as select public.get_household_invite() ->> 'token' as token;
grant select on live_invite to anon, authenticated;

-- ── Signed out ─────────────────────────────────────────────────────────────
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

select is(
  (select public.preview_household_invite(token) ->> 'status' from first_invite),
  'expired',
  'the old link stops working once renewed'
);
select ok(
  (select p ->> 'status' = 'ok' and p ->> 'household_name' = 'Flat 3' and p ->> 'household_avatar' = 'house:home'
          and p -> 'invited_by' ->> 'display_name' = 'Ann' and p -> 'members' = '[]'::jsonb
          and (p ->> 'member_count')::int = 1 and p -> 'leaving' = 'null'::jsonb
   from live_invite, public.preview_household_invite(live_invite.token) as p),
  'signed out, the preview shows the name, picture, who invited and how many, never who they are'
);
select is(
  (public.preview_household_invite('nope') ->> 'status'),
  'not_found',
  'an unknown link is not_found'
);
select throws_ok($$ select public.get_my_household() $$, '42501', null, 'guests can''t call the other household RPCs');
select throws_ok($$ select count(*) from public.households $$, '42501', null, 'guests can''t read households');

-- ── Ben joins from a household of one ─────────────────────────────────────
set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated","sub":"10000000-0000-4000-8000-00000000d002"}';

select ok(
  (select p ->> 'status' = 'ok' and jsonb_array_length(p -> 'members') = 1
          and p -> 'members' -> 0 ->> 'display_name' = 'Ann' and p -> 'leaving' = 'null'::jsonb
   from live_invite, public.preview_household_invite(live_invite.token) as p),
  'signed in, the preview lists the members; a household of one has nothing to leave'
);
select throws_ok($$ select public.accept_household_invite((select token from first_invite), 'Ben') $$,
  'P0001', 'invite_expired', 'a stopped link can''t be used');
select throws_ok($$ select public.accept_household_invite('nope', 'Ben') $$,
  'P0001', 'invite_not_found', 'nor an unknown one');
select throws_ok($$ select public.accept_household_invite((select token from live_invite), ' ') $$,
  'P0001', 'name_required', 'joining needs my name');

create temp table ben_old as select pg_temp.household_of('10000000-0000-4000-8000-00000000d002') as id;
reset role;
update public.households set list_changed_at = '2000-01-01', pantry_changed_at = '2000-01-01',
  household_changed_at = '2000-01-01'
where id = pg_temp.household_of('10000000-0000-4000-8000-00000000d001');
set local role authenticated;

select ok(
  (select jsonb_array_length(h -> 'members') = 2 and h ->> 'name' = 'Flat 3'
          and (select bool_or((m ->> 'is_me')::boolean and m ->> 'display_name' = 'Ben') from jsonb_array_elements(h -> 'members') m)
   from public.accept_household_invite((select token from live_invite), 'Ben') as h),
  'accept_household_invite: Ben is in Flat 3'
);
select throws_ok($$ select public.accept_household_invite((select token from live_invite), 'Ben') $$,
  'P0001', 'already_member', 'joining twice says already_member');
select is(
  (select array_agg(name order by name) from public.shopping_list_items),
  array['bread', 'onions', 'rice'],
  'his list moved in, and he sees everyone''s lines'
);
select is(
  (select array_agg(name || ':' || (user_id = '10000000-0000-4000-8000-00000000d002')::text order by name)
   from public.pantry_items),
  array['Eggs:true', 'חלב:true'],
  'his pantry moved in; the same milk in the fridge is one row, the one seen last'
);
select is(
  (select public.get_my_household() -> 'staples'),
  '["salt", "olive oil", "pepper"]'::jsonb,
  '"Always have" is the union of both'
);
reset role;
select ok(
  not exists (select 1 from public.households where id = (select id from ben_old)),
  'his old household is gone'
);
select ok(
  (select list_changed_at = now() and pantry_changed_at = now() and household_changed_at = now()
   from public.households where id = pg_temp.household_of('10000000-0000-4000-8000-00000000d001')),
  'moving rows and a person in stamps the list, the pantry and the household'
);
select is(
  (select array_agg(kind || ':' || actor_name) from public.household_activity
   where household_id = pg_temp.household_of('10000000-0000-4000-8000-00000000d001')),
  array['member_joined:Ben'],
  'the others will be told Ben joined (the moved list lines are not "added")'
);

-- ── A stranger sees nothing ───────────────────────────────────────────────
set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated","sub":"10000000-0000-4000-8000-00000000d003"}';

select is(
  (select count(*)::int from public.shopping_list_items) + (select count(*)::int from public.pantry_items)
  + (select count(*)::int from public.households where id <> pg_temp.household_of('10000000-0000-4000-8000-00000000d003')),
  0,
  'a stranger sees none of Flat 3''s list, pantry or household row'
);
select is(
  pg_temp.affected($$ update public.shopping_list_items set name = 'hacked' $$)
  + pg_temp.affected($$ delete from public.shopping_list_items $$)
  + pg_temp.affected($$ update public.pantry_items set name = 'hacked' $$)
  + pg_temp.affected($$ delete from public.pantry_items $$),
  0,
  'and can''t change or delete any of it'
);
select throws_ok($$ select count(*) from public.household_members $$, '42501', null, 'members are out of reach');
select throws_ok($$ select count(*) from public.household_invites $$, '42501', null, 'invites are out of reach');
select throws_ok($$ select count(*) from public.household_activity $$, '42501', null, 'queued pushes are out of reach');
select throws_ok($$ update public.households set name = 'mine now' $$, '42501', null, 'nobody writes households directly');
select throws_ok($$ select public.remove_household_member('10000000-0000-4000-8000-00000000d002') $$,
  'P0001', 'not_a_member', 'a stranger can''t remove anyone');
select throws_ok($$ select public.leave_household() $$, 'P0001', 'alone', 'the last one in a household can''t leave it');

-- ── Shared list: stamps and one push per burst ────────────────────────────
reset role;
update public.households set list_changed_at = '2000-01-01', household_changed_at = '2000-01-01'
where id = pg_temp.household_of('10000000-0000-4000-8000-00000000d001');
delete from public.household_activity;
set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated","sub":"10000000-0000-4000-8000-00000000d002"}';

select ok(
  (select count(*) = 1 from public.households),
  'a member reads their household row (what Realtime sends them)'
);
insert into public.shopping_list_items (user_id, name)
values ('10000000-0000-4000-8000-00000000d002', 'apples'), ('10000000-0000-4000-8000-00000000d002', 'pears');
insert into public.shopping_list_items (user_id, name, checked) values ('10000000-0000-4000-8000-00000000d002', 'plums', false);
insert into public.shopping_list_items (user_id, name, checked) values ('10000000-0000-4000-8000-00000000d002', 'done', true);
update public.shopping_list_items set checked = true where name = 'onions';
select is(
  (select user_id from public.shopping_list_items where name = 'onions'),
  '10000000-0000-4000-8000-00000000d001'::uuid,
  'ticking someone''s line keeps who added it'
);
update public.shopping_list_items set user_id = '10000000-0000-4000-8000-00000000d002' where name = 'onions';
select is(
  (select user_id from public.shopping_list_items where name = 'onions'),
  '10000000-0000-4000-8000-00000000d001'::uuid,
  'and so does trying to change it'
);
select ok(
  (select list_changed_at = now() and household_changed_at = '2000-01-01'
   from public.households),
  'list changes stamp list_changed_at only'
);
select is(
  public.set_my_household_display_name('Benny') ->> 'id',
  pg_temp.household_of('10000000-0000-4000-8000-00000000d002')::text,
  'set_my_household_display_name returns the household'
);
select ok((select household_changed_at = now() from public.households), 'a new name stamps household_changed_at');
reset role;
select is(
  (select array_agg(row(kind, actor_name, item_count)::text) from public.household_activity),
  array[row('list_added', 'Ben', 3)::text],
  'three unticked lines in three inserts are one burst of 3 (ticked lines and ticks don''t count)'
);
select is(
  (select count(*)::int from public.household_activity_claim(50, now() + interval '1 minute')),
  0,
  'not sent while Ben is still adding (quiet for less than 2 minutes)'
);
select ok(
  (select c.item_count = 3 and c.household_name = 'Flat 3' and c.actor_name = 'Benny'
          and jsonb_array_length(c.recipients) = 1
          and c.recipients -> 0 ->> 'user_id' = '10000000-0000-4000-8000-00000000d001'
          and c.recipients -> 0 ->> 'locale' = 'en'
          and c.recipients -> 0 -> 'push_tokens' = '["ExponentPushToken[hhd001]"]'::jsonb
   from public.household_activity_claim(50, now() + interval '3 minutes') c),
  'two quiet minutes later it goes to the others (not Ben), with their language and phones, under his new name'
);
select is(
  (select count(*)::int from public.household_activity_claim(50, now() + interval '5 minutes')),
  0,
  'each push is handed out once'
);

-- ── Full at 8 ─────────────────────────────────────────────────────────────
update public.household_members set household_id = pg_temp.household_of('10000000-0000-4000-8000-00000000d001'),
  display_name = 'Filler'
where user_id in ('10000000-0000-4000-8000-00000000d011', '10000000-0000-4000-8000-00000000d012',
                  '10000000-0000-4000-8000-00000000d013', '10000000-0000-4000-8000-00000000d014',
                  '10000000-0000-4000-8000-00000000d015');
-- F1 turned pushes off (checked under "Going shopping").
update public.profiles set push_opt_out = true where id = '10000000-0000-4000-8000-00000000d011';
update public.household_members set household_id = pg_temp.household_of('10000000-0000-4000-8000-00000000d001'),
  display_name = 'Filler'
where user_id = '10000000-0000-4000-8000-00000000d016';
select is(
  (select count(*)::int from public.household_members
   where household_id = pg_temp.household_of('10000000-0000-4000-8000-00000000d001')),
  8,
  'Flat 3 has 8 people'
);
set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated","sub":"10000000-0000-4000-8000-00000000d003"}';
select is(
  (select public.preview_household_invite(token) ->> 'status' from live_invite),
  'full',
  'the preview says full'
);
select throws_ok($$ select public.accept_household_invite((select token from live_invite), 'Cat') $$,
  'P0001', 'household_full', 'and a ninth person can''t join');
reset role;
-- Back to six, so Dov can join.
update public.household_members set household_id = pg_temp.household_of('10000000-0000-4000-8000-00000000d003')
where user_id in ('10000000-0000-4000-8000-00000000d015', '10000000-0000-4000-8000-00000000d016');

-- ── Dov joins from a shared household ─────────────────────────────────────
-- Eli and Dov's household has a live link of its own, which Dov could otherwise use to slip back in.
insert into public.household_invites (household_id, token, created_by, expires_at)
values (pg_temp.household_of('10000000-0000-4000-8000-00000000d004'), repeat('E', 43),
        '10000000-0000-4000-8000-00000000d005', now() + interval '7 days');
set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated","sub":"10000000-0000-4000-8000-00000000d004"}';
select ok(
  (select p -> 'leaving' = '{"name": "Eli and Dov", "other_members": 1}'::jsonb
   from live_invite, public.preview_household_invite(live_invite.token) as p),
  'the preview tells Dov which household he would leave, and how many stay'
);
create temp table eli_household as select pg_temp.household_of('10000000-0000-4000-8000-00000000d005') as id;
grant select on eli_household to authenticated;
select lives_ok($$ select public.accept_household_invite((select token from live_invite), 'Dov') $$,
  'Dov joins Flat 3');
reset role;
select ok(
  (select count(*) = 1 from public.shopping_list_items where name = 'tea'
     and household_id = (select id from eli_household))
  and not exists (select 1 from public.shopping_list_items where name = 'tea'
                    and household_id = pg_temp.household_of('10000000-0000-4000-8000-00000000d004')),
  'from a shared household he arrives with nothing; Eli keeps the list'
);
select is(
  (select array_agg(kind || ':' || actor_name) from public.household_activity where household_id = (select id from eli_household)),
  array['member_left:Dov'],
  'and Eli will be told Dov left'
);
select ok(
  (select stopped_at is not null from public.household_invites where token = repeat('E', 43)),
  'and the household he left stops its live link, so he can''t come back with it'
);

-- ── Leaving takes a copy ───────────────────────────────────────────────────
set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated","sub":"10000000-0000-4000-8000-00000000d002"}';
create temp table ben_new as
select (h ->> 'id')::uuid as id, h from public.leave_household() as h;
reset role;
select ok(
  (select (h ->> 'is_set_up')::boolean = false and jsonb_array_length(h -> 'members') = 1
          and h -> 'staples' = '["salt", "olive oil", "pepper"]'::jsonb from ben_new),
  'leave_household gives Ben a household of one, not set up, with "Always have"'
);
select ok(
  (select count(*) from public.shopping_list_items where household_id = (select id from ben_new))
    = (select count(*) from public.shopping_list_items where household_id = pg_temp.household_of('10000000-0000-4000-8000-00000000d001'))
  and (select count(*) from public.pantry_items where household_id = (select id from ben_new)) = 2
  and (select count(*) from public.pantry_items where household_id = pg_temp.household_of('10000000-0000-4000-8000-00000000d001')) = 2,
  'and a copy of the list and pantry; Flat 3 keeps its own'
);
select ok(
  exists (select 1 from public.household_activity
          where household_id = pg_temp.household_of('10000000-0000-4000-8000-00000000d001')
            and kind = 'member_left' and actor_name = 'Benny'),
  'the others will be told Ben left'
);
set local role authenticated;
select throws_ok($$ select public.leave_household() $$, 'P0001', 'alone', 'alone again, Ben can''t leave');
select is(
  (select count(*)::int from public.shopping_list_items where name = 'bread'),
  1,
  'Ben sees only his copy'
);

-- ── Removing someone ──────────────────────────────────────────────────────
set local request.jwt.claims = '{"role":"authenticated","sub":"10000000-0000-4000-8000-00000000d001"}';
select throws_ok($$ select public.remove_household_member('10000000-0000-4000-8000-00000000d002') $$,
  'P0001', 'not_a_member', 'Ben is no longer in Flat 3');
select ok(
  (select not exists (select 1 from jsonb_array_elements(h -> 'members') m where m ->> 'display_name' = 'Dov')
          and h -> 'invite' = 'null'::jsonb
   from public.remove_household_member('10000000-0000-4000-8000-00000000d004') as h),
  'remove_household_member takes Dov out, and the link stops so he can''t come straight back'
);
reset role;
select ok(
  (select count(*) = 1 from public.household_members m
   where m.user_id = '10000000-0000-4000-8000-00000000d004' and m.display_name = ''
     and exists (select 1 from public.pantry_items p where p.household_id = m.household_id)),
  'Dov has a household of his own with a copy of the pantry'
);
select ok(
  (select recipients @> '[{"user_id": "10000000-0000-4000-8000-00000000d004", "role": "subject"}]'::jsonb
          and not recipients @> '[{"user_id": "10000000-0000-4000-8000-00000000d001"}]'::jsonb
          and subject_name = 'Dov' and actor_name = 'Ann'
   from public.household_activity_claim(50, now()) where kind = 'member_removed'),
  'Dov is told, and so are the others, but not Ann who removed him'
);

-- ── Going shopping ─────────────────────────────────────────────────────────
-- The functions run these as the service role, with no signed-in user.
set local request.jwt.claims = '';
select ok(
  (select g ->> 'status' = 'ok' and g ->> 'actor_name' = 'Ann' and g ->> 'household_name' = 'Flat 3'
          and jsonb_array_length(g -> 'recipients') = 3
          and not g -> 'recipients' @> '[{"user_id": "10000000-0000-4000-8000-00000000d011"}]'::jsonb
   from public.household_going_shopping('10000000-0000-4000-8000-00000000d001') as g),
  'going shopping reaches the others who have a phone and didn''t turn pushes off'
);
select is(
  public.household_going_shopping('10000000-0000-4000-8000-00000000d001', 20, now() + interval '19 hours') ->> 'status',
  'already_sent_today',
  'once in 20 hours'
);
select is(
  public.household_going_shopping('10000000-0000-4000-8000-00000000d001', 20, now() + interval '21 hours') ->> 'status',
  'ok',
  'and again after'
);
select is(
  public.household_going_shopping('10000000-0000-4000-8000-00000000d002') ->> 'status',
  'alone',
  'nobody to tell when alone'
);

-- ── Pantry rescan reminder, per household ─────────────────────────────────
update public.pantry_items set source = 'scan', user_id = '10000000-0000-4000-8000-00000000d001',
  last_seen_at = now() - interval '20 days'
where household_id = pg_temp.household_of('10000000-0000-4000-8000-00000000d001') and name = 'Eggs';
update public.pantry_items set source = 'scan', user_id = '10000000-0000-4000-8000-00000000d011',
  last_seen_at = now() - interval '16 days'
where household_id = pg_temp.household_of('10000000-0000-4000-8000-00000000d001') and name = 'חלב';
select is(
  (select array_agg(c.user_id) from public.pantry_rescan_candidates(200, now()) c
   where c.user_id in (select user_id from public.household_members
                       where household_id = pg_temp.household_of('10000000-0000-4000-8000-00000000d001'))),
  array['10000000-0000-4000-8000-00000000d011'::uuid],
  'the rescan reminder goes only to whoever in the household scanned last'
);
insert into public.nudge_sends (user_id, kind, channel)
values ('10000000-0000-4000-8000-00000000d011', 'pantry_rescan', 'push'),
       ('10000000-0000-4000-8000-00000000d001', 'pantry_rescan', 'email');
update public.pantry_items set last_seen_at = now()
where household_id = pg_temp.household_of('10000000-0000-4000-8000-00000000d001') and name = 'Eggs';
select is(
  (select count(*)::int from public.nudge_sends
   where kind = 'pantry_rescan' and user_id in ('10000000-0000-4000-8000-00000000d011', '10000000-0000-4000-8000-00000000d001')),
  0,
  'a scan by anyone starts the clock over for everyone in the household'
);

-- ── 600 items per household ───────────────────────────────────────────────
insert into public.pantry_items (household_id, user_id, name, place)
select pg_temp.household_of('10000000-0000-4000-8000-00000000d003'), '10000000-0000-4000-8000-00000000d003', 'item ' || g, 'cupboard'
from generate_series(1, 600) g;
select throws_ok(
  format($$ insert into public.pantry_items (household_id, user_id, name, place) values (%L, %L, 'one more', 'fridge') $$,
         pg_temp.household_of('10000000-0000-4000-8000-00000000d015'), '10000000-0000-4000-8000-00000000d015'),
  '23514', 'pantry_full',
  'a household''s pantry holds 600 items'
);

-- ── Account deletion ──────────────────────────────────────────────────────
update public.household_members set household_id = pg_temp.household_of('10000000-0000-4000-8000-00000000d001'),
  display_name = 'Gil'
where user_id = '10000000-0000-4000-8000-00000000d020';
insert into public.shopping_list_items (user_id, name) values ('10000000-0000-4000-8000-00000000d020', 'gil''s cheese');
insert into public.pantry_items (user_id, name, place) values ('10000000-0000-4000-8000-00000000d020', 'gil''s olives', 'fridge');
create temp table dov_household as select pg_temp.household_of('10000000-0000-4000-8000-00000000d004') as id;
-- Deleted with someone signed in (auth.uid() set), as the admin dashboard's admin_delete_user does.
set local request.jwt.claims = '{"role":"authenticated","sub":"10000000-0000-4000-8000-00000000d001"}';
select lives_ok(
  $$ delete from auth.users where id in ('10000000-0000-4000-8000-00000000d020', '10000000-0000-4000-8000-00000000d004') $$,
  'an account that added to a shared list and pantry can be deleted, also by someone signed in (an admin)'
);
set local request.jwt.claims = '';
select ok(
  (select user_id is null and household_id = pg_temp.household_of('10000000-0000-4000-8000-00000000d001')
   from public.shopping_list_items where name = 'gil''s cheese')
  and (select user_id is null from public.pantry_items where name = 'gil''s olives'),
  'deleting an account keeps what they added on the others'' list and pantry'
);
select ok(
  exists (select 1 from public.household_activity
          where household_id = pg_temp.household_of('10000000-0000-4000-8000-00000000d001')
            and kind = 'member_left' and actor_name = 'Gil' and actor_id is null),
  'and the others are told they left'
);
select ok(
  not exists (select 1 from public.households where id = (select id from dov_household))
  and not exists (select 1 from public.pantry_items where household_id = (select id from dov_household)),
  'the household of a deleted account that was alone goes, with its rows'
);

-- ── Grants and Realtime ───────────────────────────────────────────────────
select ok(
  has_function_privilege('anon', 'public.preview_household_invite(text)', 'execute')
  and not has_function_privilege('anon', 'public.get_my_household()', 'execute')
  and not has_function_privilege('anon', 'public.accept_household_invite(text, text)', 'execute')
  and has_function_privilege('authenticated', 'public.accept_household_invite(text, text)', 'execute')
  and has_function_privilege('authenticated', 'public.remove_household_member(uuid)', 'execute'),
  'the app RPCs: preview for everyone, the rest for signed-in users'
);
select ok(
  not has_function_privilege('authenticated', 'public.household_activity_claim(int, timestamptz)', 'execute')
  and not has_function_privilege('authenticated', 'public.household_going_shopping(uuid, int, timestamptz)', 'execute')
  and not has_function_privilege('authenticated', 'public.household_json(uuid, uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.household_split_off(uuid, uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.household_ensure(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.household_push_target(uuid, text)', 'execute')
  and has_function_privilege('service_role', 'public.household_activity_claim(int, timestamptz)', 'execute')
  and has_function_privilege('service_role', 'public.household_going_shopping(uuid, int, timestamptz)', 'execute'),
  'the push and internal functions are for the service role only'
);
select ok(
  not has_table_privilege('authenticated', 'public.households', 'update')
  and not has_table_privilege('authenticated', 'public.household_members', 'select')
  and not has_table_privilege('authenticated', 'public.household_invites', 'select')
  and not has_table_privilege('anon', 'public.shopping_list_items', 'select'),
  'clients write no household table, and guests have no list table'
);
select ok(
  exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'households')
  and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime'
                  and tablename in ('household_members', 'household_invites', 'household_activity')),
  'only the households row goes out over Realtime'
);
select ok(
  exists (select 1 from cron.job where jobname = 'pinch-household-activity' and schedule = '* * * * *'),
  'the household-activity job runs every minute (and calls the function only when a push is due)'
);

select * from finish();
rollback;
