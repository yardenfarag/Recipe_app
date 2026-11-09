begin;

create extension if not exists pgtap with schema extensions;
select plan(8);

select ok(
  not has_table_privilege('anon', 'public.profiles', 'insert')
  and not has_table_privilege('anon', 'public.profiles', 'update')
  and not has_any_column_privilege('anon', 'public.profiles', 'update'),
  'anon cannot write profiles'
);

select ok(
  not has_column_privilege('authenticated', 'public.profiles', 'is_admin', 'insert')
  and not has_column_privilege('authenticated', 'public.profiles', 'is_admin', 'update')
  and not has_column_privilege('authenticated', 'public.profiles', 'token_balance', 'update'),
  'signed-in users cannot write is_admin or token_balance'
);

select ok(
  not has_function_privilege('anon', 'public.ensure_user_profile(uuid)', 'execute'),
  'anon cannot call ensure_user_profile'
);

select ok(
  has_function_privilege('authenticated', 'public.ensure_user_profile(uuid)', 'execute')
  and has_function_privilege('service_role', 'public.ensure_user_profile(uuid)', 'execute'),
  'signed-in users and Edge Functions can still call ensure_user_profile'
);

select is(
  (
    select count(*)::int
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prorettype = 'trigger'::regtype
      and (has_function_privilege('anon', p.oid, 'execute')
           or has_function_privilege('authenticated', p.oid, 'execute'))
  ),
  0,
  'clients cannot execute trigger functions'
);

select is(
  (
    select count(*)::int
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and p.proconfig is null
  ),
  0,
  'every SECURITY DEFINER function pins its search_path'
);

-- Triggers still fire for a signed-in user after the revoke.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values (
  '00000000-0000-0000-0000-000000000000',
  '10000000-0000-4000-8000-000000000051',
  'authenticated', 'authenticated', 'grants-test@pinch.invalid', '',
  now(), '{}'::jsonb, '{}'::jsonb, now(), now()
);

select ok(
  exists (select 1 from public.profiles where id = '10000000-0000-4000-8000-000000000051'),
  'handle_new_user still creates the profile'
);

set local role authenticated;
set local request.jwt.claims =
  '{"role":"authenticated","sub":"10000000-0000-4000-8000-000000000051"}';

select lives_ok(
  $$
    insert into public.recipes (user_id, title, original_url, platform, ingredients, instructions)
    values ('10000000-0000-4000-8000-000000000051', 'Grant test', 'https://example.com/grant-test',
            'web', '[{"name":"egg","quantity":1,"unit":""}]'::jsonb, '[{"step":1,"text":"Boil"}]'::jsonb)
  $$,
  'signed-in users can still save recipes (insert triggers fire)'
);

select * from finish();
rollback;
