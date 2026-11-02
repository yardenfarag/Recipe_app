begin;

create extension if not exists pgtap with schema extensions;
select plan(3);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values (
  '00000000-0000-0000-0000-000000000000',
  '10000000-0000-4000-8000-000000000061',
  'authenticated', 'authenticated', 'remix-cap@pinch.invalid', '',
  now(), '{}'::jsonb, '{}'::jsonb, now(), now()
);

select is(
  public.reserve_daily_ai_usage('10000000-0000-4000-8000-000000000061', 'remix', current_date, 2),
  1,
  'first remix of the day is reserved'
);

select is(
  public.reserve_daily_ai_usage('10000000-0000-4000-8000-000000000061', 'remix', current_date, 2),
  2,
  'second remix of the day is reserved'
);

select is(
  public.reserve_daily_ai_usage('10000000-0000-4000-8000-000000000061', 'remix', current_date, 2),
  -1,
  'remixes past the daily cap are refused'
);

select * from finish();
rollback;
