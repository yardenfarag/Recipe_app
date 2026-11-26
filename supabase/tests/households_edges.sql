begin;

create extension if not exists pgtap with schema extensions;
select plan(42);

-- Households (migration 20261126130000_households, ADR 034): races, caps and edges. households.sql has the main
-- story; this file has what a review found plus the cases it lacked.
--   O (e001) sets up "Big house" and fills it to 8 through the RPC with J2..J8 (e002..e008); N (e009) is the ninth.
--   P (e010) and Q (e011) share "Pantry flat" (caps, merges, stale writes). R (e012) joins it from a big pantry.
--   S (e013) is a stranger. L (e014) and M (e015) test leaving, removing and old links.

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
select '00000000-0000-0000-0000-000000000000',
       format('10000000-0000-4000-8000-00000000e%s', lpad(g::text, 3, '0'))::uuid,
       'authenticated', 'authenticated', format('hh-edge-%s@pinch.invalid', g), '',
       now(), '{}', '{"locale":"en"}', now(), now()
from generate_series(1, 15) g;

create function pg_temp.household_of(p_user uuid) returns uuid
language sql security definer set search_path = '' as $$
  select m.household_id from public.household_members m where m.user_id = p_user;
$$;
grant execute on function pg_temp.household_of(uuid) to anon, authenticated, service_role;

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

-- The value a write returned (an update ... returning), run as the caller.
create function pg_temp.returned(q text) returns text
language plpgsql as $$
declare
  v text;
begin
  execute q into v;
  return v;
end;
$$;
grant execute on function pg_temp.returned(text) to authenticated;

-- ── The service role ──────────────────────────────────────────────────────
set local role service_role;
set local request.jwt.claims = '{"role":"service_role"}';
select lives_ok(
  $$ insert into public.shopping_list_items (user_id, name) values ('10000000-0000-4000-8000-00000000e013', 'by service') $$,
  'the service role inserts a list line with user_id only'
);
select lives_ok(
  $$ insert into public.pantry_items (user_id, name, place) values ('10000000-0000-4000-8000-00000000e013', 'by service', 'fridge') $$,
  'and a pantry item'
);
reset role;
set local request.jwt.claims = '';
select ok(
  (select household_id = pg_temp.household_of('10000000-0000-4000-8000-00000000e013')
   from public.shopping_list_items where name = 'by service')
  and (select household_id = pg_temp.household_of('10000000-0000-4000-8000-00000000e013')
       from public.pantry_items where name = 'by service'),
  'both land in that person''s household'
);

-- A profile with no household (made while the migration ran): an old build's insert makes one.
delete from public.household_members where user_id = '10000000-0000-4000-8000-00000000e015';
set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated","sub":"10000000-0000-4000-8000-00000000e015"}';
select lives_ok(
  $$ insert into public.shopping_list_items (user_id, name, household_id)
     values ('10000000-0000-4000-8000-00000000e015', 'first line', null) $$,
  'an insert by someone with no household yet still works'
);
reset role;
select ok(
  pg_temp.household_of('10000000-0000-4000-8000-00000000e015') is not null
  and (select household_id = pg_temp.household_of('10000000-0000-4000-8000-00000000e015')
       from public.shopping_list_items where name = 'first line'),
  'and gives them a household, where the line lands'
);

-- ── Filling to 8 through the RPC ──────────────────────────────────────────
set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated","sub":"10000000-0000-4000-8000-00000000e001"}';
select lives_ok($$ select public.set_up_household('Big house', 'house:castle', 'O') $$, 'O sets up');
create temp table big_invite as select public.get_household_invite() ->> 'token' as token;
reset role;

do $fill$
declare
  v_token text := (select token from big_invite);
begin
  for i in 2..8 loop
    perform set_config('request.jwt.claims',
      json_build_object('role', 'authenticated', 'sub', format('10000000-0000-4000-8000-00000000e%s', lpad(i::text, 3, '0')))::text,
      true);
    set local role authenticated;
    perform public.accept_household_invite(v_token, 'J' || i);
    reset role;
  end loop;
end;
$fill$;

select is(
  (select count(*)::int from public.household_members
   where household_id = pg_temp.household_of('10000000-0000-4000-8000-00000000e001')),
  8,
  'seven people join through accept_household_invite: 8 in all'
);
set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated","sub":"10000000-0000-4000-8000-00000000e009"}';
select throws_ok($$ select public.accept_household_invite((select token from big_invite), 'N') $$,
  'P0001', 'household_full', 'the ninth is refused');

-- Any member can rename it, not just the one who set it up.
set local request.jwt.claims = '{"role":"authenticated","sub":"10000000-0000-4000-8000-00000000e005"}';
select is(
  public.update_household('Bigger house', 'house:home') ->> 'name',
  'Bigger house',
  'update_household works for a member who didn''t set it up'
);
select ok(
  (select h ->> 'id' = pg_temp.household_of('10000000-0000-4000-8000-00000000e005')::text
          and (select count(*) from jsonb_array_elements(h -> 'members') m where (m ->> 'is_me')::boolean) = 1
   from public.set_my_household_display_name('Jay') as h),
  'set_my_household_display_name (household locked first)'
);

-- ── "Always have" applies just my change ──────────────────────────────────
reset role;
update public.households set staples = array['salt', 'oil', 'rice']
where id = pg_temp.household_of('10000000-0000-4000-8000-00000000e001');
set local role authenticated;
-- J5 was looking at ['salt'] (before someone added oil and rice), and added pepper.
select is(
  public.set_household_staples(array['salt', 'pepper'], array['salt']),
  array['salt', 'oil', 'rice', 'pepper'],
  'an add is applied to the list as it is now, keeping what others added meanwhile'
);
select is(
  public.set_household_staples(array['oil', 'rice', 'pepper'], array['SALT', 'oil', 'rice', 'pepper']),
  array['oil', 'rice', 'pepper'],
  'a removal removes just that one (ignoring case)'
);
reset role;
update public.households set staples = array['oil', 'rice', 'pepper', 'flour']
where id = pg_temp.household_of('10000000-0000-4000-8000-00000000e001');
set local role authenticated;
select is(
  public.set_household_staples(array['oil', 'pepper'], array['oil', 'rice', 'pepper']),
  array['oil', 'pepper', 'flour'],
  'removing one while someone added another keeps theirs'
);
select is(
  public.set_household_staples(array['tea']),
  array['tea'],
  'without the previous list it replaces (old behaviour)'
);

-- ── Going shopping: giving a failed send back ─────────────────────────────
reset role;
set local request.jwt.claims = '';
select is(
  public.household_going_shopping('10000000-0000-4000-8000-00000000e001', 20, now() - interval '1 minute') ->> 'status',
  'ok',
  'a send is recorded'
);
select ok(
  not public.household_going_shopping_failed('10000000-0000-4000-8000-00000000e001', now())
  and (select going_shopping_sent_at is not null from public.household_members
       where user_id = '10000000-0000-4000-8000-00000000e001'),
  'giving back a send that isn''t the recorded one changes nothing'
);
select ok(
  public.household_going_shopping_failed('10000000-0000-4000-8000-00000000e001', now() - interval '1 minute')
  and public.household_going_shopping('10000000-0000-4000-8000-00000000e001') ->> 'status' = 'ok',
  'giving back the recorded send clears the wait, so trying again works'
);

-- ── Pantry flat: P and Q ──────────────────────────────────────────────────
update public.households set name = 'Pantry flat', avatar = 'house:home', set_up_at = now()
where id = pg_temp.household_of('10000000-0000-4000-8000-00000000e010');
update public.household_members set household_id = pg_temp.household_of('10000000-0000-4000-8000-00000000e010')
where user_id = '10000000-0000-4000-8000-00000000e011';
insert into public.shopping_list_items (user_id, name, updated_at)
values ('10000000-0000-4000-8000-00000000e010', 'milk', now());
insert into public.pantry_items (user_id, name, place, source, last_seen_at)
values ('10000000-0000-4000-8000-00000000e010', 'Eggs', 'fridge', 'scan', now());

set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated","sub":"10000000-0000-4000-8000-00000000e011"}';
select is(
  pg_temp.returned($$ update public.shopping_list_items set checked = true, updated_at = now() - interval '1 minute'
                      where name = 'milk' returning checked::text $$),
  'false',
  'a write older than the row (a phone saving what it fetched earlier) is dropped, and the row still comes back'
);
select is(
  pg_temp.returned($$ update public.shopping_list_items set checked = true, updated_at = now() - interval '10 seconds'
                      where name = 'milk' returning checked::text $$),
  'true',
  'a phone whose clock is a few seconds behind still gets its tick through'
);
select is(
  pg_temp.returned($$ update public.shopping_list_items set checked = true, updated_at = now() + interval '1 hour'
                      where name = 'milk' returning (updated_at = now())::text $$),
  'true',
  'an accepted write is stamped with the database time, so a clock running ahead cannot make other edits look stale'
);
update public.shopping_list_items set user_id = null where name = 'milk';
update public.pantry_items set user_id = null where name = 'Eggs';
select ok(
  (select user_id = '10000000-0000-4000-8000-00000000e010' from public.shopping_list_items where name = 'milk')
  and (select user_id = '10000000-0000-4000-8000-00000000e010' from public.pantry_items where name = 'Eggs'),
  'a member can''t clear who added a line or last saw an item'
);
select throws_ok(
  format($$ update public.shopping_list_items set household_id = %L where name = 'milk' $$,
         pg_temp.household_of('10000000-0000-4000-8000-00000000e013')),
  '42501', null,
  'a member can''t move a list line to another household'
);
select throws_ok(
  format($$ update public.pantry_items set household_id = %L where name = 'Eggs' $$,
         pg_temp.household_of('10000000-0000-4000-8000-00000000e013')),
  '42501', null,
  'or a pantry item'
);
select throws_ok(
  format($$ insert into public.pantry_items (household_id, user_id, name, place) values (%L, %L, 'planted', 'fridge') $$,
         pg_temp.household_of('10000000-0000-4000-8000-00000000e013'), '10000000-0000-4000-8000-00000000e011'),
  '42501', null,
  'or add to another household''s pantry'
);

-- 600 items: an upsert of something already there still works; a new one doesn't.
reset role;
insert into public.pantry_items (household_id, user_id, name, place, last_seen_at)
select pg_temp.household_of('10000000-0000-4000-8000-00000000e010'), '10000000-0000-4000-8000-00000000e010',
       'item ' || g, 'cupboard', now() - make_interval(days => g)
from generate_series(1, 599) g;
set local role authenticated;
select lives_ok(
  $$ insert into public.pantry_items (user_id, name, place, source, last_seen_at)
     values ('10000000-0000-4000-8000-00000000e011', 'eggs', 'fridge', 'scan', now())
     on conflict (household_id, place, name_key) do update set last_seen_at = excluded.last_seen_at, user_id = excluded.user_id $$,
  'at 600, an upsert of an item already there goes through'
);
select throws_ok(
  $$ insert into public.pantry_items (user_id, name, place) values ('10000000-0000-4000-8000-00000000e011', 'brand new', 'fridge')
     on conflict (household_id, place, name_key) do update set last_seen_at = excluded.last_seen_at $$,
  '23514', 'pantry_full',
  'a new one doesn''t'
);

-- R joins from a household of one with 3 items, one of them older than the flat's.
reset role;
set local request.jwt.claims = '';
insert into public.pantry_items (user_id, name, place, source, last_seen_at)
values ('10000000-0000-4000-8000-00000000e012', 'Eggs', 'fridge', 'scan', now() - interval '2 days'),
       ('10000000-0000-4000-8000-00000000e012', 'Kale', 'fridge', 'scan', now() - interval '1 hour'),
       ('10000000-0000-4000-8000-00000000e012', 'Figs', 'fridge', 'scan', now() - interval '2 hours');
set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated","sub":"10000000-0000-4000-8000-00000000e010"}';
create temp table flat_invite as select public.get_household_invite() ->> 'token' as token;
set local request.jwt.claims = '{"role":"authenticated","sub":"10000000-0000-4000-8000-00000000e012"}';
select lives_ok($$ select public.accept_household_invite((select token from flat_invite), 'R') $$, 'R joins');
reset role;
select is(
  (select count(*)::int from public.pantry_items where household_id = pg_temp.household_of('10000000-0000-4000-8000-00000000e010')),
  600,
  'a merge that would pass 600 keeps 600'
);
select ok(
  exists (select 1 from public.pantry_items where name = 'Kale' and household_id = pg_temp.household_of('10000000-0000-4000-8000-00000000e012'))
  and exists (select 1 from public.pantry_items where name = 'Figs' and household_id = pg_temp.household_of('10000000-0000-4000-8000-00000000e012'))
  and not exists (select 1 from public.pantry_items where name = 'item 599'),
  'the ones seen last (the oldest go)'
);
select is(
  (select user_id from public.pantry_items
   where name_key = 'eggs' and household_id = pg_temp.household_of('10000000-0000-4000-8000-00000000e010')),
  '10000000-0000-4000-8000-00000000e011'::uuid,
  'when the household''s own row is newer, it wins over the one moving in'
);

-- ── Links after leaving, removing, stopping, expiring ─────────────────────
update public.households set name = 'Link house', avatar = 'house:home', set_up_at = now()
where id = pg_temp.household_of('10000000-0000-4000-8000-00000000e014');
set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated","sub":"10000000-0000-4000-8000-00000000e014"}';
create temp table link_invite as select public.get_household_invite() ->> 'token' as token;
set local request.jwt.claims = '{"role":"authenticated","sub":"10000000-0000-4000-8000-00000000e015"}';
select lives_ok($$ select public.accept_household_invite((select token from link_invite), 'M') $$, 'M joins Link house');
select ok(
  (select (h ->> 'is_set_up')::boolean = false and jsonb_array_length(h -> 'members') = 1
   from public.remove_household_member('10000000-0000-4000-8000-00000000e015') as h),
  'remove_household_member on myself leaves, into a household of one'
);
select throws_ok($$ select public.accept_household_invite((select token from link_invite), 'M') $$,
  'P0001', 'invite_expired', 'leaving stops the link, so the leaver can''t slip back in with it');
select ok(
  (select p ->> 'status' = 'expired' and p -> 'members' = '[]'::jsonb
   from link_invite, public.preview_household_invite(link_invite.token) as p),
  'nor see who is there'
);

set local request.jwt.claims = '{"role":"authenticated","sub":"10000000-0000-4000-8000-00000000e014"}';
drop table link_invite;
create temp table link_invite as select public.get_household_invite() ->> 'token' as token;
set local request.jwt.claims = '{"role":"authenticated","sub":"10000000-0000-4000-8000-00000000e015"}';
select lives_ok($$ select public.accept_household_invite((select token from link_invite), 'M') $$, 'M joins again with a new link');
set local request.jwt.claims = '{"role":"authenticated","sub":"10000000-0000-4000-8000-00000000e014"}';
select lives_ok($$ select public.remove_household_member('10000000-0000-4000-8000-00000000e015') $$, 'L removes M');
set local request.jwt.claims = '{"role":"authenticated","sub":"10000000-0000-4000-8000-00000000e015"}';
select throws_ok($$ select public.accept_household_invite((select token from link_invite), 'M') $$,
  'P0001', 'invite_expired', 'the removed person''s old link doesn''t work');

set local request.jwt.claims = '{"role":"authenticated","sub":"10000000-0000-4000-8000-00000000e014"}';
drop table link_invite;
create temp table link_invite as select public.get_household_invite() ->> 'token' as token;
select public.stop_household_invite();
select ok(
  (select public.get_my_household() -> 'invite' = 'null'::jsonb)
  and (select public.preview_household_invite(token) ->> 'status' from link_invite) = 'already_member',
  'stop_household_invite: no live link left'
);
set local request.jwt.claims = '{"role":"authenticated","sub":"10000000-0000-4000-8000-00000000e015"}';
select is((select public.preview_household_invite(token) ->> 'status' from link_invite), 'expired',
  'a stopped link previews as expired');

-- Seven days later.
set local request.jwt.claims = '{"role":"authenticated","sub":"10000000-0000-4000-8000-00000000e014"}';
drop table link_invite;
create temp table link_invite as select public.get_household_invite() ->> 'token' as token;
grant select on link_invite to anon;
reset role;
update public.household_invites set created_at = now() - interval '8 days', expires_at = now() - interval '1 day'
where token = (select token from link_invite);
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select is((select public.preview_household_invite(token) ->> 'status' from link_invite), 'expired',
  'an expired link previews as expired');
set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated","sub":"10000000-0000-4000-8000-00000000e015"}';
select throws_ok($$ select public.accept_household_invite((select token from link_invite), 'M') $$,
  'P0001', 'invite_expired', 'and can''t be used');
reset role;

-- ── Grants ─────────────────────────────────────────────────────────────────
select ok(
  not has_function_privilege('anon', 'public.household_json(uuid, uuid)', 'execute')
  and not has_function_privilege('anon', 'public.household_split_off(uuid, uuid)', 'execute')
  and not has_function_privilege('anon', 'public.household_lock_mine(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.household_lock_mine(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.household_going_shopping_failed(uuid, timestamptz)', 'execute')
  and has_function_privilege('service_role', 'public.household_going_shopping_failed(uuid, timestamptz)', 'execute')
  and has_function_privilege('service_role', 'public.my_household_id()', 'execute')
  and has_function_privilege('authenticated', 'public.set_household_staples(text[], text[])', 'execute'),
  'internal helpers are out of reach; the service role can use the column default'
);

select * from finish();
rollback;
