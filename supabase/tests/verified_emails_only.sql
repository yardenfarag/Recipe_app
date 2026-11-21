begin;

create extension if not exists pgtap with schema extensions;
select plan(6);

-- PIN-153: welcome emails only go to confirmed addresses, and a user can't change the email
-- on their profile.

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-4000-8000-000000000c01',
   'authenticated', 'authenticated', 'confirmed@pinch.invalid', '',
   now() - interval '10 minutes', '{}', '{"locale":"he"}', now() - interval '10 minutes', now()),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-4000-8000-000000000c02',
   'authenticated', 'authenticated', 'a-strangers-address@pinch.invalid', '',
   null, '{}', '{}', now() - interval '10 minutes', now());

select is(
  (select array_agg(email order by email) from public.welcome_email_candidates(200)
   where user_id in ('10000000-0000-4000-8000-000000000c01', '10000000-0000-4000-8000-000000000c02')),
  array['confirmed@pinch.invalid'],
  'only the confirmed address is welcomed'
);

update auth.users set email_confirmed_at = now() where id = '10000000-0000-4000-8000-000000000c02';
select is(
  (select count(*)::int from public.welcome_email_candidates(200)
   where user_id = '10000000-0000-4000-8000-000000000c02'),
  1, 'an address confirmed later is welcomed on the next run'
);

select ok(
  not has_function_privilege('anon', 'public.welcome_email_candidates(int)', 'execute')
  and not has_function_privilege('authenticated', 'public.welcome_email_candidates(int)', 'execute'),
  'clients cannot list accounts to welcome'
);

-- profiles.email ---------------------------------------------------------------
select ok(
  not has_column_privilege('authenticated', 'public.profiles', 'email', 'update')
  and has_column_privilege('authenticated', 'public.profiles', 'avatar_url', 'update')
  and has_column_privilege('authenticated', 'public.profiles', 'kitchen', 'update')
  and has_column_privilege('authenticated', 'public.profiles', 'contribute_to_hub', 'update')
  and has_column_privilege('authenticated', 'public.profiles', 'token_pack_notify_at', 'update'),
  'signed-in users can update their profile, except the email'
);

set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated","sub":"10000000-0000-4000-8000-000000000c01"}';
select throws_ok(
  $$ update public.profiles set email = 'someone-else@pinch.invalid'
     where id = '10000000-0000-4000-8000-000000000c01' $$,
  '42501', null, 'a user cannot point their profile at another address'
);
select lives_ok(
  $$ update public.profiles set contribute_to_hub = false
     where id = '10000000-0000-4000-8000-000000000c01' $$,
  'the other profile settings still save'
);

select * from finish();
rollback;
