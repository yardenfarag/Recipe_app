begin;

create extension if not exists pgtap with schema extensions;
select plan(17);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values (
  '00000000-0000-0000-0000-000000000000',
  '10000000-0000-4000-8000-000000000001',
  'authenticated',
  'authenticated',
  'credits-test@pinch.invalid',
  '',
  now(),
  '{}'::jsonb,
  '{}'::jsonb,
  now(),
  now()
);

select ok(
  exists (
    select 1 from public.profiles
    where id = '10000000-0000-4000-8000-000000000001'
  ),
  'signup creates a credit profile'
);

update public.profiles
set token_balance = 2
where id = '10000000-0000-4000-8000-000000000001';

select is(
  public.reserve_recipe_credit(
    '10000000-0000-4000-8000-000000000001',
    '2099-01',
    'request-free-01',
    15
  )->>'source',
  'monthly_free',
  'monthly free credits are spent first'
);

select public.reserve_recipe_credit(
  '10000000-0000-4000-8000-000000000001',
  '2099-01',
  'request-free-' || lpad(n::text, 2, '0'),
  15
)
from generate_series(2, 15) n;

select is(
  (select extract_count from public.extract_usage_monthly
   where user_id = '10000000-0000-4000-8000-000000000001'
     and year_month = '2099-01'),
  15,
  'free monthly usage reaches the limit'
);

create temporary table paid_reservation as
select public.reserve_recipe_credit(
  '10000000-0000-4000-8000-000000000001',
  '2099-01',
  'request-paid-01',
  15
) as result;

select is(
  (select result->>'source' from paid_reservation),
  'purchased',
  'purchased credit is used after free credits'
);
select is(
  (select token_balance from public.profiles
   where id = '10000000-0000-4000-8000-000000000001'),
  1,
  'paid balance is decremented'
);

select is(
  public.reserve_recipe_credit(
    '10000000-0000-4000-8000-000000000001',
    '2099-01',
    'request-paid-01',
    15
  )->>'reservation_id',
  (select result->>'reservation_id' from paid_reservation),
  'an idempotency key returns the same reservation'
);
select is(
  (select token_balance from public.profiles
   where id = '10000000-0000-4000-8000-000000000001'),
  1,
  'idempotent retry does not charge again'
);

select ok(
  public.refund_recipe_credit(
    '10000000-0000-4000-8000-000000000001',
    (select (result->>'reservation_id')::uuid from paid_reservation),
    'test_failure'
  ),
  'reserved paid credit can be refunded'
);
select is(
  (select token_balance from public.profiles
   where id = '10000000-0000-4000-8000-000000000001'),
  2,
  'refund restores paid balance'
);
select ok(
  public.refund_recipe_credit(
    '10000000-0000-4000-8000-000000000001',
    (select (result->>'reservation_id')::uuid from paid_reservation),
    'duplicate_refund'
  ),
  'duplicate refund is idempotent'
);
select is(
  (select token_balance from public.profiles
   where id = '10000000-0000-4000-8000-000000000001'),
  2,
  'duplicate refund does not add balance'
);

update public.profiles
set token_balance = 0
where id = '10000000-0000-4000-8000-000000000001';

select is(
  public.reserve_recipe_credit(
    '10000000-0000-4000-8000-000000000001',
    '2099-01',
    'request-empty-01',
    15
  )->>'code',
  'insufficient_credits',
  'empty pools are rejected'
);
select is(
  public.reserve_recipe_credit(
    '10000000-0000-4000-8000-000000000001',
    '2099-02',
    'request-next-month',
    15
  )->>'source',
  'monthly_free',
  'a new UTC month has a fresh free pool'
);

select is(
  public.grant_purchased_credits(
    '10000000-0000-4000-8000-000000000001',
    10,
    'revenuecat',
    'event-001',
    'transaction-001',
    'pinch_credits_10',
    '{}'::jsonb
  ),
  10,
  'verified purchase grants credits'
);
select is(
  public.grant_purchased_credits(
    '10000000-0000-4000-8000-000000000001',
    10,
    'revenuecat',
    'event-001',
    'transaction-001',
    'pinch_credits_10',
    '{}'::jsonb
  ),
  10,
  'duplicate webhook event does not grant twice'
);
select is(
  public.grant_purchased_credits(
    '10000000-0000-4000-8000-000000000001',
    10,
    'revenuecat',
    'event-002',
    'transaction-001',
    'pinch_credits_10',
    '{}'::jsonb
  ),
  10,
  'duplicate store transaction does not grant twice'
);
select is(
  (select count(*)::int from public.purchase_credit_grants
   where user_id = '10000000-0000-4000-8000-000000000001'),
  1,
  'only one purchase grant is recorded'
);

select * from finish();
rollback;
