begin;

create extension if not exists pgtap with schema extensions;
select plan(14);

-- User A owns the rows; user B and anon try to reach them (PIN-35, PIN-54).
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-4000-8000-000000000091',
   'authenticated', 'authenticated', 'rls-a@pinch.invalid', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-4000-8000-000000000092',
   'authenticated', 'authenticated', 'rls-b@pinch.invalid', '', now(), '{}', '{}', now(), now());

insert into public.recipes (id, user_id, title, ingredients, instructions)
values ('20000000-0000-4000-8000-000000000091', '10000000-0000-4000-8000-000000000091', 'A soup',
        '[{"name":"egg","quantity":1,"unit":""}]', '[{"step":1,"text":"Boil"}]');
insert into public.collections (id, user_id, name)
values ('30000000-0000-4000-8000-000000000091', '10000000-0000-4000-8000-000000000091', 'A list');
insert into public.collection_recipes (collection_id, recipe_id)
values ('30000000-0000-4000-8000-000000000091', '20000000-0000-4000-8000-000000000091');
insert into public.shopping_list_items (user_id, name)
values ('10000000-0000-4000-8000-000000000091', 'onions');
insert into public.recipe_translations (recipe_id, language_code, title)
values ('20000000-0000-4000-8000-000000000091', 'he', 'מרק');
insert into public.support_tickets (user_id, email, category, message)
values ('10000000-0000-4000-8000-000000000091', 'rls-a@pinch.invalid', 'other', 'private');
insert into public.feedback (user_id, message, platform)
values ('10000000-0000-4000-8000-000000000091', 'private feedback', 'ios');

-- Rows of `owner` the current role can see, across every public table with a
-- user_id column. Runs as the caller, so RLS applies.
create function pg_temp.visible_rows_of(owner uuid) returns int
language plpgsql as $$
declare
  t record;
  n int;
  total int := 0;
begin
  for t in
    select c.table_name
    from information_schema.columns c
    join information_schema.tables tb
      on tb.table_schema = c.table_schema and tb.table_name = c.table_name
    where c.table_schema = 'public' and c.column_name = 'user_id' and tb.table_type = 'BASE TABLE'
  loop
    execute format('select count(*) from public.%I where user_id = $1', t.table_name) into n using owner;
    total := total + n;
  end loop;
  return total;
end;
$$;
grant execute on function pg_temp.visible_rows_of(uuid) to anon, authenticated;

-- Rows a write touched, run as the caller.
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

-- Structure: holds for every table, including ones added later.
select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity),
  0,
  'every public table has RLS enabled'
);

select is(
  (select count(*)::int from pg_policy p
   where p.polrelid::regclass::text not in ('recipe_cards')
     and pg_get_expr(p.polqual, p.polrelid) = 'true'),
  0,
  'no policy outside the public hub lets everyone through'
);

select is(
  (select count(*)::int from pg_policy p
   join information_schema.columns c
     on c.table_schema = 'public' and c.table_name = p.polrelid::regclass::text and c.column_name = 'user_id'
   where coalesce(pg_get_expr(p.polqual, p.polrelid), '') || coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '')
         !~ '(auth\.uid\(\)|is_current_user_admin\(\)|is_admin)'
     and not (p.polrelid::regclass::text = 'product_events' and p.polcmd = 'a')),
  0,
  'every policy on a user-owned table checks auth.uid() or admin'
);

-- User B.
set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated","sub":"10000000-0000-4000-8000-000000000092"}';

select is(pg_temp.visible_rows_of('10000000-0000-4000-8000-000000000091'), 0,
  'another user sees none of A''s rows in any user-owned table');

select is(
  (select count(*)::int from public.collection_recipes) + (select count(*)::int from public.recipe_translations),
  0,
  'another user sees none of A''s collection entries or translations'
);

select is(
  pg_temp.affected($$ update public.recipes set title = 'hijacked'
                      where id = '20000000-0000-4000-8000-000000000091' $$),
  0,
  'another user cannot update A''s recipe'
);

select is(
  pg_temp.affected($$ delete from public.recipes where id = '20000000-0000-4000-8000-000000000091' $$),
  0,
  'another user cannot delete A''s recipe'
);

select throws_ok(
  $$ insert into public.recipes (user_id, title) values ('10000000-0000-4000-8000-000000000091', 'planted') $$,
  '42501', null,
  'another user cannot create a recipe in A''s library'
);

select throws_ok(
  $$ insert into public.recipe_translations (recipe_id, language_code, title)
     values ('20000000-0000-4000-8000-000000000091', 'fr', 'soupe') $$,
  '42501', null,
  'another user cannot add a translation to A''s recipe'
);

select throws_ok(
  $$ insert into public.support_tickets (user_id, email, category, message)
     values ('10000000-0000-4000-8000-000000000091', 'x@pinch.invalid', 'other', 'spoofed') $$,
  '42501', null,
  'another user cannot file a support ticket as A'
);

-- Anonymous visitor.
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

select is(pg_temp.visible_rows_of('10000000-0000-4000-8000-000000000091'), 0,
  'anon sees none of A''s rows in any user-owned table');

-- User A.
set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated","sub":"10000000-0000-4000-8000-000000000091"}';

select ok(
  (select count(*) from public.recipes) = 1
  and (select count(*) from public.collections) = 1
  and (select count(*) from public.collection_recipes) = 1
  and (select count(*) from public.shopping_list_items) = 1
  and (select count(*) from public.recipe_translations) = 1
  and (select count(*) from public.support_tickets) = 1,
  'A sees each of their own rows'
);

select is(
  pg_temp.affected($$ update public.recipes set title = 'A soup, better'
                      where id = '20000000-0000-4000-8000-000000000091' $$),
  1,
  'A can update their own recipe'
);

select is(
  (select count(*)::int from public.feedback),
  0,
  'feedback is write-only for its author (only admins read it)'
);

select * from finish();
rollback;
